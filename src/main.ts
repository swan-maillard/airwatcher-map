import "@fontsource/josefin-sans/latin-500";
import "@fontsource/barlow/latin-400";
import "@fontsource/barlow/latin-500";
import "@fontsource/barlow-condensed/latin-500";
import "./style.css";

import { ORIGINAL_SETTINGS, checkEfficiency, scanSensors, type ScanSettings, type SensorScan } from "./analysis";
import { parseCleaners, parseSensors, type AirCleaner, type Sensor } from "./data";
import { list, shortDate } from "./format";
import { SensorMap, type MapItem } from "./map";
import { Panel } from "./panel";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function fetchText(file: string): Promise<string> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!response.ok) throw new Error(`${file}: ${response.status}`);
  return response.text();
}

async function start() {
  const panel = new Panel($("panel"));
  let sensors: Sensor[];
  let cleaners: AirCleaner[];
  try {
    const [sensorsCsv, measurementsCsv, cleanersCsv] = await Promise.all(
      ["sensors.csv", "measurements.csv", "cleaners.csv"].map(fetchText),
    );
    sensors = parseSensors(sensorsCsv, measurementsCsv);
    cleaners = parseCleaners(cleanersCsv);
  } catch (error) {
    panel.showError(`The CSV files didn't load (${String(error)}). Try reloading the page.`);
    return;
  }

  const dates = sensors[0].readings.O3.map((r) => r.date.slice(0, 10));
  const lastDate = dates[dates.length - 1];
  const original = scanSensors(sensors);
  const originalFlags = original.filter((s) => s.flagged).map((s) => s.sensor.id);
  const cleanerResults = new Map(
    cleaners.map((c) => [c.id, checkEfficiency(c, sensors, new Set(originalFlags))] as const),
  );

  let settings: ScanSettings = { ...ORIGINAL_SETTINGS };
  let scan: SensorScan[] = original;
  // A hash like #s:12 or #c:1 opens that sensor or cleaner, so a selection can be linked.
  const fromHash = decodeURIComponent(location.hash.slice(1));
  const known = (key: string) =>
    key.startsWith("s:") ? Number(key.slice(2)) < sensors.length : cleaners.some((c) => `c:${c.id}` === key);
  let selected = /^[sc]:\d+$/.test(fromHash) && known(fromHash) ? fromHash : "s:43";

  const items: MapItem[] = [
    ...sensors.map((s) => ({ key: `s:${s.id}`, kind: "sensor" as const, id: s.id, position: s.position })),
    ...cleaners.map((c) => ({ key: `c:${c.id}`, kind: "cleaner" as const, id: c.id, position: c.position })),
  ];
  const map = new SensorMap($("map"), items, (key) => select(key));
  const picker = $<HTMLSelectElement>("picker");
  picker.innerHTML = `
    <optgroup label="Sensors">${sensors.map((s) => `<option value="s:${s.id}">Sensor ${s.id}</option>`).join("")}</optgroup>
    <optgroup label="Air cleaners">${cleaners.map((c) => `<option value="c:${c.id}">Air cleaner ${c.id}</option>`).join("")}</optgroup>`;
  picker.addEventListener("change", () => select(picker.value));

  const flaggedIds = () => scan.filter((s) => s.flagged).map((s) => s.sensor.id);

  function select(key: string) {
    selected = key;
    history.replaceState(null, "", `#${key}`);
    render();
  }

  function render() {
    const flagged = flaggedIds();
    const flaggedKeys = new Set(flagged.map((id) => `s:${id}`));
    const context = { settings, lastDate, originalFlags, select };
    const [kind, idText] = selected.split(":");
    const id = Number(idText);
    picker.value = selected;
    for (const option of picker.querySelectorAll("option")) {
      const [k, i] = option.value.split(":");
      if (k === "s") option.textContent = `Sensor ${i}${flaggedKeys.has(option.value) ? " (flagged)" : ""}`;
    }

    let inUse: string[] = [];
    let links: { to: string; miss?: boolean }[] = [];
    let summary: string;
    if (kind === "s") {
      const result = scan[id];
      inUse = result.neighbours.map((n) => `s:${n.sensor.id}`);
      links = inUse.map((to) => ({ to }));
      panel.showSensor(result, context);
      summary = `Selected: sensor ${id}, ${result.flagged ? "flagged" : "not flagged"}, with neighbours ${list(result.neighbours.map((n) => n.sensor.id))}.`;
    } else {
      const result = cleanerResults.get(id)!;
      inUse = result.steps.filter((s) => s.hasEffect).map((s) => `s:${s.sensor.id}`);
      links = result.steps.map((s) => ({ to: `s:${s.sensor.id}`, miss: !s.hasEffect }));
      panel.showCleaner(result, context);
      summary = `Selected: air cleaner ${id}. ${result.hadEffect ? `Sensors showing its effect: ${list(inUse.map((k) => k.slice(2)))}.` : "No effect found."}`;
    }

    map.update({
      selected,
      flagged: flaggedKeys,
      inUse: new Set(inUse),
      links,
      labels: (key) => {
        const [k, i] = key.split(":");
        if (k === "c") return `Air cleaner ${i}`;
        return `Sensor ${i}${flaggedKeys.has(key) ? ", flagged" : ""}${inUse.includes(key) ? ", used by the selected check" : ""}`;
      },
    });
    $("map-summary").textContent = `Map of ${sensors.length} sensors and ${cleaners.length} air cleaners. ${flagged.length} sensors are flagged${flagged.length ? `: ${list(flagged)}` : ""}. ${summary}`;
    renderStatus(flagged);
  }

  const neighbours = $<HTMLInputElement>("neighbours");
  const factor = $<HTMLInputElement>("factor");
  const day = $<HTMLInputElement>("day");
  day.max = String(dates.length - 1);
  day.value = day.max;

  function readSettings() {
    const dayIndex = Number(day.value);
    settings = {
      neighbours: Number(neighbours.value),
      toleranceFactor: Number(factor.value),
      date: dayIndex === dates.length - 1 ? undefined : dates[dayIndex],
    };
    $("neighbours-out").textContent = neighbours.value;
    $("factor-out").textContent = factor.value;
    $("day-out").textContent = shortDate(dates[dayIndex]);
    scan = isOriginal() ? original : scanSensors(sensors, settings);
    render();
  }

  function isOriginal() {
    return (
      settings.neighbours === ORIGINAL_SETTINGS.neighbours &&
      settings.toleranceFactor === ORIGINAL_SETTINGS.toleranceFactor &&
      settings.date === undefined
    );
  }

  function renderStatus(flagged: number[]) {
    const status = $("settings-status");
    const which = flagged.length && flagged.length <= 12 ? `: ${list(flagged)}` : "";
    status.innerHTML = isOriginal()
      ? `Original settings: ${flagged.length} sensors flagged${which}.`
      : `<strong>${flagged.length} sensors flagged</strong>${which}. With the original settings it's ${originalFlags.length}.`;
    $<HTMLButtonElement>("reset").disabled = isOriginal();
  }

  for (const input of [neighbours, factor, day]) input.addEventListener("input", readSettings);
  $("reset").addEventListener("click", () => {
    neighbours.value = String(ORIGINAL_SETTINGS.neighbours);
    factor.value = String(ORIGINAL_SETTINGS.toleranceFactor);
    day.value = day.max;
    readSettings();
  });

  render();
}

start();

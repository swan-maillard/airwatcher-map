import {
  CLEANER_ORDER,
  EFFECT_THRESHOLD,
  ORIGINAL_SETTINGS,
  percent,
  type Check,
  type CleanerResult,
  type ScanSettings,
  type SensorScan,
} from "./analysis";
import { POLLUTANTS, readingBefore, type Pollutant } from "./data";
import { POLLUTANT_NAMES, dateAndTime, km, list, longDate, printed, two } from "./format";

export interface PanelContext {
  settings: ScanSettings;
  lastDate: string;
  originalFlags: number[];
  select: (key: string) => void;
}

const name = (p: Pollutant) => POLLUTANT_NAMES[p];

export class Panel {
  private title: HTMLHeadingElement;
  private pill: HTMLSpanElement;
  private verdict: HTMLDivElement;
  private details: HTMLDivElement;

  constructor(root: HTMLElement) {
    const head = document.createElement("div");
    head.className = "panel-head";
    this.title = document.createElement("h2");
    this.title.id = "panel-title";
    this.pill = document.createElement("span");
    this.pill.className = "pill";
    head.append(this.title, this.pill);

    this.verdict = document.createElement("div");
    this.verdict.className = "verdict";
    this.verdict.setAttribute("aria-live", "polite");

    this.details = document.createElement("div");
    this.details.className = "panel-details";

    root.append(head, this.verdict, this.details);
    this.title.textContent = "Loading the readings";
    this.verdict.innerHTML = "<p>Reading 146,000 measurements from the original CSV files.</p>";
  }

  showError(message: string) {
    this.title.textContent = "Couldn't load the data";
    this.pill.hidden = true;
    this.verdict.innerHTML = `<p>${message}</p>`;
  }

  showSensor(scan: SensorScan, context: PanelContext) {
    const id = scan.sensor.id;
    this.title.textContent = `Sensor ${id}`;
    this.pill.hidden = false;
    this.pill.textContent = scan.flagged ? "Flagged by the scan" : "Not flagged";
    this.pill.classList.toggle("alert", scan.flagged);
    this.verdict.innerHTML = sensorVerdict(scan);

    const checks = POLLUTANTS.map((p) => checkCard(p, scan.checks[p])).join("");
    const neighbours = scan.neighbours
      .map(
        (n) =>
          `<li><button type="button" data-key="s:${n.sensor.id}">Sensor ${n.sensor.id} · ${km(n.distance)}</button></li>`,
      )
      .join("");

    this.details.innerHTML = `
      <p class="small">${readingsNote(context)}</p>
      <div class="checks">${checks}</div>
      <p class="small">The reference is a mean of the neighbours' readings. The tolerance is the variance of their
        readings for that pollutant. A reading further from the reference than the tolerance fails the check.</p>
      <div class="sub">
        <h3>Its ${scan.neighbours.length} nearest sensors</h3>
        <ul class="chips">${neighbours}</ul>
        <p class="small">Distances are the ones the original computes, in km.</p>
      </div>`;
    this.bindButtons(context);
  }

  showCleaner(result: CleanerResult, context: PanelContext) {
    const { cleaner, steps } = result;
    this.title.textContent = `Air cleaner ${cleaner.id}`;
    this.pill.hidden = false;
    this.pill.textContent = result.hadEffect ? "Had an effect" : "No effect found";
    this.pill.classList.remove("alert");
    this.verdict.innerHTML = cleanerVerdict(result);

    const first = steps[0].sensor;
    const before = readingBefore(first.readings.O3, cleaner.start).date;
    const after = readingBefore(first.readings.O3, cleaner.end).date;
    const rows = steps
      .map((step, i) => {
        const cls = i === result.edge ? "edge" : step.hasEffect ? "" : "stop";
        const cells = CLEANER_ORDER.map((p) => `<td>${percent(step.reduction[p])}%</td>`).join("");
        return `<tr class="${cls}"><td>${step.sensor.id}</td><td>${step.distance.toFixed(1)}</td>${cells}</tr>`;
      })
      .join("");
    const heads = CLEANER_ORDER.map((p) => `<th scope="col">${name(p)}</th>`).join("");

    this.details.innerHTML = `
      <p class="small">It ran from ${dateAndTime(cleaner.start)} to ${dateAndTime(cleaner.end)}. Each sensor's
        reading from ${longDate(before)} is compared with its reading from ${longDate(after)}, the last ones before
        the cleaner was switched on and off.</p>
      <div class="sub">
        <h3>Sensors checked, nearest first</h3>
        <div class="table-wrap">
          <table>
            <caption class="visually-hidden">Drop in each pollutant per sensor, in percent</caption>
            <thead><tr><th scope="col">Sensor</th><th scope="col">km</th>${heads}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="small">Drops are in percent, cut to whole numbers like the original prints them. A drop of
          ${EFFECT_THRESHOLD * 100}% or more in any one pollutant counts as an effect. Sensors flagged by the scan
          (${list(context.originalFlags)}) are left out, like in the original.</p>
      </div>`;
    this.bindButtons(context);
  }

  private bindButtons(context: PanelContext) {
    for (const button of this.details.querySelectorAll<HTMLButtonElement>("button[data-key]")) {
      button.addEventListener("click", () => context.select(button.dataset.key!));
    }
  }
}

function readingsNote({ settings, lastDate }: PanelContext): string {
  const parts: string[] = [];
  if (settings.date === undefined) {
    parts.push(`Readings from ${longDate(lastDate)}, each sensor's last day, which is what the original always uses.`);
  } else {
    parts.push(`Readings from ${longDate(settings.date)}. The original only looks at the last reading (${longDate(lastDate)}).`);
  }
  if (settings.neighbours !== ORIGINAL_SETTINGS.neighbours || settings.toleranceFactor !== ORIGINAL_SETTINGS.toleranceFactor) {
    parts.push(
      `Using ${settings.neighbours} neighbours, with ${settings.toleranceFactor === 1 ? "the variance" : `${settings.toleranceFactor} times the variance`} as the tolerance. The original uses 5 neighbours and the variance as is.`,
    );
  }
  return parts.join(" ");
}

function sensorVerdict(scan: SensorScan): string {
  const id = scan.sensor.id;
  const outside = POLLUTANTS.filter((p) => scan.checks[p].outside);
  const failing = (p: Pollutant) => {
    const c = scan.checks[p];
    return `its ${name(p)} reading of ${two(c.reading)} is ${two(c.gap)} away from the reference of ${two(c.reference)}, more than the tolerance of ${two(c.tolerance)}`;
  };

  if (outside.length === 1) return `<p>Sensor ${id} is flagged: ${failing(outside[0])}.</p>`;
  if (outside.length > 1) {
    const lines = outside.map((p) => `<p>${capitalise(failing(p))}.</p>`).join("");
    return `<p>Sensor ${id} is flagged on ${list(outside.map(name))}.</p>${lines}`;
  }

  const closest = POLLUTANTS.reduce((a, b) => (ratio(scan.checks[b]) > ratio(scan.checks[a]) ? b : a));
  const c = scan.checks[closest];
  return `<p>Sensor ${id} isn't flagged: all four readings are within the tolerance of their reference. The closest
    call is ${name(closest)}, ${two(c.gap)} away from the reference of ${two(c.reference)} with a tolerance of
    ${two(c.tolerance)}.</p>`;
}

const ratio = (c: Check) => (c.tolerance === 0 ? Infinity : c.gap / c.tolerance);
const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1);

function drops(step: CleanerResult["steps"][number]): string {
  return list(CLEANER_ORDER.map((p) => `${percent(step.reduction[p])}% in ${name(p)}`));
}

function cleanerVerdict(result: CleanerResult): string {
  const [first] = result.steps;
  const rose = CLEANER_ORDER.some((p) => first.reduction[p] < 0) ? " (a negative drop means the reading went up)" : "";
  const opening = `Its nearest sensor, sensor ${first.sensor.id} (${km(first.distance)} away), dropped by ${drops(first)}${rose}.`;
  if (!result.hadEffect) {
    return `<p>${opening} All four are under ${EFFECT_THRESHOLD * 100}%, so the original reports that this cleaner had
      no effect on the air around it and stops there.</p>`;
  }
  const edge = result.steps[result.edge!];
  const stop = result.steps[result.edge! + 1];
  const reach = stop
    ? `Going outwards, sensors keep showing a drop of ${EFFECT_THRESHOLD * 100}% or more up to sensor ${edge.sensor.id}. The next one, sensor ${stop.sensor.id} (${km(stop.distance)}), doesn't.`
    : `Going outwards, every sensor shows a drop of ${EFFECT_THRESHOLD * 100}% or more, up to the furthest one, sensor ${edge.sensor.id}.`;
  return `<p>${opening} ${reach} So the original reports a radius of ${printed(result.radius!)} km.</p>`;
}

function checkCard(p: Pollutant, c: Check): string {
  const lo = Math.min(c.reading, c.reference - c.tolerance);
  const hi = Math.max(c.reading, c.reference + c.tolerance);
  const pad = (hi - lo) * 0.08 || 1;
  const at = (x: number) => (((x - lo + pad) / (hi - lo + 2 * pad)) * 100).toFixed(2);
  const tolLeft = at(c.reference - c.tolerance);
  const tolWidth = (Number(at(c.reference + c.tolerance)) - Number(tolLeft)).toFixed(2);
  return `
    <div class="check${c.outside ? " outside" : ""}">
      <div class="check-head">
        <span class="check-name">${name(p)}</span>
        <span class="check-verdict">${c.outside ? "Outside the tolerance" : "Within the tolerance"}</span>
      </div>
      <div class="check-numbers">
        <span>reading <b>${two(c.reading)}</b></span>
        <span>reference <b>${two(c.reference)}</b></span>
        <span>gap <b>${two(c.gap)}</b></span>
        <span>tolerance <b>${two(c.tolerance)}</b></span>
      </div>
      <div class="band" aria-hidden="true">
        <span class="band-axis"></span>
        <span class="band-tol" style="left:${tolLeft}%;width:${tolWidth}%"></span>
        <span class="band-ref" style="left:${at(c.reference)}%"></span>
        <span class="band-reading" style="left:${at(c.reading)}%"></span>
      </div>
    </div>`;
}

export const POLLUTANTS = ["O3", "SO2", "NO2", "PM10"] as const;
export type Pollutant = (typeof POLLUTANTS)[number];

export interface Position {
  latitude: number;
  longitude: number;
}

export interface Reading {
  date: string;
  value: number;
}

export interface Sensor {
  id: number;
  position: Position;
  readings: Record<Pollutant, Reading[]>;
}

export interface AirCleaner {
  id: number;
  position: Position;
  start: string;
  end: string;
}

// Same digit-by-digit parsing as strToDouble in Util.cpp, which doesn't always round like
// parseFloat does.
export function strToDouble(str: string): number {
  let nb = 0;
  let i = 0;
  let p = 10;
  let neg = 1;
  if (str[0] === "-") {
    i++;
    neg = -1;
  }
  while (i < str.length && str[i] !== ".") {
    nb *= 10;
    nb += str.charCodeAt(i) - 48;
    i++;
  }
  i++;
  while (i < str.length) {
    nb += (str.charCodeAt(i) - 48) / p;
    p *= 10;
    i++;
  }
  return neg * nb;
}

function rows(csv: string): string[][] {
  return csv
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(";"));
}

function emptyReadings(): Record<Pollutant, Reading[]> {
  return { O3: [], SO2: [], NO2: [], PM10: [] };
}

export function parseSensors(sensorsCsv: string, measurementsCsv: string): Sensor[] {
  const sensors: Sensor[] = rows(sensorsCsv).map(([name, lat, lon]) => ({
    id: Number(name.slice(6)),
    position: { latitude: strToDouble(lat), longitude: strToDouble(lon) },
    readings: emptyReadings(),
  }));

  const seen = sensors.map(() => new Set<string>());
  for (const [date, name, type, value] of rows(measurementsCsv)) {
    const index = Number(name.slice(6));
    const readings = sensors[index].readings[type as Pollutant];
    const key = `${type} ${date}`;
    // A std::map keeps the first value inserted for a date.
    if (!readings || seen[index].has(key)) continue;
    seen[index].add(key);
    readings.push({ date, value: strToDouble(value) });
  }

  for (const sensor of sensors) {
    for (const pollutant of POLLUTANTS) {
      sensor.readings[pollutant].sort((a, b) => compareDates(a.date, b.date));
    }
  }
  return sensors;
}

export function parseCleaners(cleanersCsv: string): AirCleaner[] {
  return rows(cleanersCsv).map(([name, lat, lon, start, end]) => ({
    id: Number(name.slice(7)),
    position: { latitude: strToDouble(lat), longitude: strToDouble(lon) },
    start,
    end,
  }));
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  min: number;
  sec: number;
}

function dateParts(date: string): DateParts {
  const part = (from: number, length: number) => Number(date.slice(from, from + length));
  return {
    year: part(0, 4),
    month: part(5, 2),
    day: part(8, 2),
    hour: part(11, 2),
    min: part(14, 2),
    sec: part(17, 2),
  };
}

// Date::operator< from Date.cpp, kept as written.
export function dateLess(a: string, b: string): boolean {
  const x = dateParts(a);
  const y = dateParts(b);
  if (x.year < y.year) return true;
  if (x.month * 35 + x.day < y.month * 35 + y.day) return true;
  if (x.hour < y.hour) return true;
  if (x.min < y.min) return true;
  return x.sec < y.sec;
}

function compareDates(a: string, b: string): number {
  if (dateLess(a, b)) return -1;
  if (dateLess(b, a)) return 1;
  return 0;
}

// --map.lower_bound(date): the last reading the map orders before the given date.
export function readingBefore(readings: Reading[], date: string): Reading {
  const index = readings.findIndex((reading) => !dateLess(reading.date, date));
  return readings[index === -1 ? readings.length - 1 : index - 1];
}

export function readingOn(readings: Reading[], date: string): number {
  const exact = readings.find((reading) => reading.date.startsWith(date));
  return exact ? exact.value : readings[readings.length - 1].value;
}

export function lastValue(readings: Reading[]): number {
  return readings[readings.length - 1].value;
}

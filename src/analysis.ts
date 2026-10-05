import {
  POLLUTANTS,
  lastValue,
  readingOn,
  valueBefore,
  type AirCleaner,
  type Pollutant,
  type Position,
  type Sensor,
} from "./data";

// Position::calculateDistance, in km.
export function distance(a: Position, b: Position): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lon1 = (a.longitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const lon2 = (b.longitude * Math.PI) / 180;
  return (
    Math.acos(Math.sin(lon1) * Math.sin(lon2) + Math.cos(lon1) * Math.cos(lon2) * Math.cos(lat1 - lat2)) * 6371
  );
}

export interface Neighbour {
  sensor: Sensor;
  distance: number;
}

// A std::multimap<double, Sensor*> keeps equal distances in insertion order, and
// Array.prototype.sort is stable, so ties come out in the same order.
export function byDistance(from: Position, sensors: Sensor[]): Neighbour[] {
  return sensors
    .map((sensor) => ({ sensor, distance: distance(from, sensor.position) }))
    .sort((a, b) => a.distance - b.distance);
}

export type Values = Record<Pollutant, number>;

export interface Check {
  reading: number;
  reference: number;
  gap: number;
  tolerance: number;
  outside: boolean;
}

export interface SensorScan {
  sensor: Sensor;
  neighbours: Neighbour[];
  reading: Values;
  mean: Values;
  variance: Values;
  checks: Record<Pollutant, Check>;
  flagged: boolean;
}

export interface ScanSettings {
  neighbours: number;
  toleranceFactor: number;
  // undefined means each sensor's last reading, which is what the original does.
  date?: string;
}

export const ORIGINAL_SETTINGS: ScanSettings = { neighbours: 5, toleranceFactor: 1 };

function zeros(): Values {
  return { O3: 0, SO2: 0, NO2: 0, PM10: 0 };
}

function check(reading: number, reference: number, tolerance: number): Check {
  const gap = Math.abs(reference - reading);
  return { reading, reference, gap, tolerance, outside: gap > tolerance };
}

// SensorAnalysis::scanSensors. Every operation runs in the same order as the C++, so the
// sums round the same way.
export function scanSensors(sensors: Sensor[], settings: ScanSettings = ORIGINAL_SETTINGS): SensorScan[] {
  const k = settings.neighbours;
  const valueOf = (sensor: Sensor, pollutant: Pollutant) =>
    settings.date === undefined
      ? lastValue(sensor.readings[pollutant])
      : readingOn(sensor.readings[pollutant], settings.date);

  return sensors.map((sensor) => {
    const reading = zeros();
    for (const p of POLLUTANTS) reading[p] = valueOf(sensor, p);

    const others = sensors.filter((other) => other.id !== sensor.id);
    const neighbours = byDistance(sensor.position, others).slice(0, k);

    const mean = zeros();
    for (const { sensor: near } of neighbours) {
      for (const p of POLLUTANTS) mean[p] += valueOf(near, p) / k;
    }
    const variance = zeros();
    for (const { sensor: near } of neighbours) {
      for (const p of POLLUTANTS) variance[p] += Math.pow(valueOf(near, p) - mean[p], 2) / (k - 1);
    }

    const f = settings.toleranceFactor;
    const checks: Record<Pollutant, Check> = {
      O3: check(reading.O3, mean.O3, variance.O3 * f),
      SO2: check(reading.SO2, mean.SO2, variance.SO2 * f),
      NO2: check(reading.NO2, mean.SO2, variance.NO2 * f),
      PM10: check(reading.PM10, mean.PM10, variance.PM10 * f),
    };
    const flagged = POLLUTANTS.some((p) => checks[p].outside);
    return { sensor, neighbours, reading, mean, variance, checks, flagged };
  });
}

// The order valeurAvantEtApres returns values in.
export const CLEANER_ORDER: Pollutant[] = ["O3", "NO2", "SO2", "PM10"];
export const EFFECT_THRESHOLD = 0.25;

export interface CleanerStep {
  sensor: Sensor;
  distance: number;
  before: Values;
  after: Values;
  reduction: Values;
  hasEffect: boolean;
}

export interface CleanerResult {
  cleaner: AirCleaner;
  steps: CleanerStep[];
  hadEffect: boolean;
  // Index in steps of the sensor that sets the radius, when the cleaner had an effect.
  edge?: number;
  radius?: number;
}

function cleanerStep(cleaner: AirCleaner, near: Neighbour): CleanerStep {
  const before = zeros();
  const after = zeros();
  const reduction = zeros();
  for (const p of CLEANER_ORDER) {
    before[p] = valueBefore(near.sensor.readings[p], cleaner.start);
    after[p] = valueBefore(near.sensor.readings[p], cleaner.end);
    reduction[p] = (before[p] - after[p]) / before[p];
  }
  const hasEffect = !CLEANER_ORDER.every((p) => reduction[p] < EFFECT_THRESHOLD);
  return { sensor: near.sensor, distance: near.distance, before, after, reduction, hasEffect };
}

// AirCleanerAnalysis::checkEfficiency. Sensors the scan flagged are left out, like the original.
export function checkEfficiency(cleaner: AirCleaner, sensors: Sensor[], flagged: Set<number>): CleanerResult {
  const ordered = byDistance(
    cleaner.position,
    sensors.filter((sensor) => !flagged.has(sensor.id)),
  );

  const first = cleanerStep(cleaner, ordered[0]);
  if (!first.hasEffect) return { cleaner, steps: [first], hadEffect: false };

  const steps = [first];
  let i = 1;
  while (i < ordered.length) {
    const step = cleanerStep(cleaner, ordered[i]);
    steps.push(step);
    if (!step.hasEffect) break;
    i++;
  }
  const edge = i - 1;
  return { cleaner, steps, hadEffect: true, edge, radius: distance(cleaner.position, ordered[edge].sensor.position) };
}

export function percent(reduction: number): number {
  return Math.trunc(100 * reduction);
}

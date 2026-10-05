import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanSensors } from "../src/analysis";
import { fixture, load, REAL_DATA } from "./load";

// One line per sensor, printed by a copy of the original SensorAnalysis.cpp with a printf
// added just before the comparison (compiled with g++ 11, -std=c++11).
interface CppLine {
  id: number;
  last: number[];
  mean: number[];
  variance: number[];
  order: { id: number; distance: number }[];
}

function readDump(): CppLine[] {
  return readFileSync(fixture("cpp-scan-dump.txt"), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const t = line.split(" ");
      const nums = (from: number) => t.slice(from, from + 4).map(Number);
      return {
        id: Number(t[1]),
        last: nums(3),
        mean: nums(8),
        variance: nums(13),
        order: t.slice(18).map((pair) => {
          const [id, d] = pair.split(":");
          return { id: Number(id), distance: Number(d) };
        }),
      };
    });
}

// JavaScript's Math and glibc can round sin, cos, acos or pow one bit apart, so values that
// go through them are compared to within a couple of units in the last place.
function expectSameDouble(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * 4.5e-16);
}

const { sensors } = load(REAL_DATA);
const scan = scanSensors(sensors);
const dump = readDump();
// The C++ prints O3, SO2, NO2, PM10 in that order.
const ORDER = ["O3", "SO2", "NO2", "PM10"] as const;

describe("faulty-sensor scan on the real data", () => {
  it("flags the same six sensors as the compiled original", () => {
    expect(scan.filter((s) => s.flagged).map((s) => s.sensor.id)).toEqual([1, 43, 53, 63, 68, 73]);
  });

  it("orders every other sensor by distance exactly like the C++ multimap", () => {
    const everyone = scanSensors(sensors, { neighbours: 99, toleranceFactor: 1 });
    for (const line of dump) {
      const result = scan[line.id];
      const order = everyone[line.id].neighbours;
      expect(order.map((n) => n.sensor.id)).toEqual(line.order.map((o) => o.id));
      order.forEach((n, i) => expectSameDouble(n.distance, line.order[i].distance));
      expect(result.neighbours.map((n) => n.sensor.id)).toEqual(line.order.slice(0, 5).map((o) => o.id));
    }
  });

  it("matches the C++ readings, means and variances for all 100 sensors", () => {
    for (const line of dump) {
      const result = scan[line.id];
      ORDER.forEach((p, i) => {
        expect(result.reading[p]).toBe(line.last[i]);
        expect(result.mean[p]).toBe(line.mean[i]);
        expectSameDouble(result.variance[p], line.variance[i]);
      });
    }
  });

  it("gives the values behind a few verdicts", () => {
    const s43 = scan[43];
    expect(s43.neighbours.map((n) => n.sensor.id)).toEqual([33, 53, 44, 42, 23]);
    expect(s43.reading.SO2).toBe(34.71);
    expect(s43.mean.SO2).toBeCloseTo(43.358, 3);
    expect(s43.variance.SO2).toBeCloseTo(4.559, 3);
    expect(s43.checks.SO2.outside).toBe(true);
    expect(["O3", "NO2", "PM10"].map((p) => s43.checks[p as "O3"].outside)).toEqual([false, false, false]);

    const s68 = scan[68];
    expect(s68.checks.PM10.reading).toBe(35.65);
    expect(s68.checks.PM10.reference).toBeCloseTo(44.804, 3);
    expect(s68.checks.PM10.tolerance).toBeCloseTo(8.349, 3);
    expect(s68.checks.PM10.outside).toBe(true);

    const s0 = scan[0];
    expect(s0.flagged).toBe(false);
    expect(s0.neighbours.map((n) => n.sensor.id)).toEqual([10, 1, 20, 11, 21]);
  });
});

describe("faulty-sensor scan on the original's test data", () => {
  it("Test7: flags sensor 5, the one with broken readings", () => {
    const flagged = scanSensors(load(fixture("test7")).sensors).filter((s) => s.flagged);
    expect(flagged.map((s) => s.sensor.id)).toEqual([5]);
  });

  it("Test8: flags nothing when every sensor works", () => {
    const flagged = scanSensors(load(fixture("test8")).sensors).filter((s) => s.flagged);
    expect(flagged).toEqual([]);
  });
});

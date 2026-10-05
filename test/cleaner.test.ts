import { describe, expect, it } from "vitest";
import { checkEfficiency, CLEANER_ORDER, percent, scanSensors } from "../src/analysis";
import { fixture, load, REAL_DATA } from "./load";

// cout prints doubles with 6 significant digits.
const printed = (x: number) => Number(x.toPrecision(6));

function run(dir: string, cleanerIndex: number, useScan: boolean) {
  const { sensors, cleaners } = load(dir);
  const flagged = useScan
    ? new Set(scanSensors(sensors).filter((s) => s.flagged).map((s) => s.sensor.id))
    : new Set<number>();
  return checkEfficiency(cleaners[cleanerIndex], sensors, flagged);
}

// The C++ prints the four reductions in CLEANER_ORDER.
const percents = (r: ReturnType<typeof run>) => CLEANER_ORDER.map((p) => percent(r.steps[0].reduction[p]));

describe("air-cleaner analysis on the real data", () => {
  for (const useScan of [false, true]) {
    const when = useScan ? "after the scan" : "without the scan";

    it(`Cleaner0 has no effect (${when})`, () => {
      expect(run(REAL_DATA, 0, useScan).hadEffect).toBe(false);
    });

    it(`Cleaner1 prints 93, 93, 94, 93 % and a 127.426 km radius (${when})`, () => {
      const result = run(REAL_DATA, 1, useScan);
      expect(result.hadEffect).toBe(true);
      expect(percents(result)).toEqual([93, 93, 94, 93]);
      expect(printed(result.radius!)).toBe(127.426);
    });
  }
});

describe("air-cleaner analysis on the original's test data", () => {
  it("Test10: 50, 50, 50, 40 % and a 55.5975 km radius", () => {
    const result = run(fixture("test10"), 0, false);
    expect(percents(result)).toEqual([50, 50, 50, 40]);
    expect(printed(result.radius!)).toBe(55.5975);
  });

  it("Test11: no effect", () => {
    expect(run(fixture("test11"), 0, false).hadEffect).toBe(false);
  });
});

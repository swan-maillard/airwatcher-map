import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCleaners, parseSensors } from "../src/data";

export function load(dir: string) {
  const read = (name: string) => readFileSync(join(dir, name), "utf8");
  return {
    sensors: parseSensors(read("sensors.csv"), read("measurements.csv")),
    cleaners: parseCleaners(read("cleaners.csv")),
  };
}

export const REAL_DATA = join(__dirname, "..", "public", "data");
export const fixture = (name: string) => join(__dirname, "fixtures", name);

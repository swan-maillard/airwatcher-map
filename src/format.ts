import type { Pollutant } from "./data";

export const POLLUTANT_NAMES: Record<Pollutant, string> = {
  O3: "O₃",
  SO2: "SO₂",
  NO2: "NO₂",
  PM10: "PM10",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function longDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function shortDate(date: string): string {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return `${day} ${MONTHS[month - 1].slice(0, 3)} ${year}`;
}

export function dateAndTime(date: string): string {
  return `${longDate(date)}, ${date.slice(11, 16)}`;
}

export const two = (x: number) => x.toFixed(2);
export const km = (x: number) => `${x.toFixed(1)} km`;

// cout's default: 6 significant digits.
export const printed = (x: number) => String(Number(x.toPrecision(6)));

export function list(items: (string | number)[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

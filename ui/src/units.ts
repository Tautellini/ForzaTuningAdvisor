// Display unit preferences, mirroring Forza's tuning unit options.

export type UnitSystem = "metric" | "imperial";
export type PowerUnit = "kW" | "bhp" | "PS";
export type SpringUnit = "N/mm" | "lb/in" | "kgf/mm";

export interface Units {
  system: UnitSystem;
  power: PowerUnit;
  springs: SpringUnit;
}

export const DEFAULT_UNITS: Units = { system: "metric", power: "kW", springs: "N/mm" };

const KEY = "fta.units";

export function loadUnits(): Units {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Units> | null;
    return { ...DEFAULT_UNITS, ...(v ?? {}) };
  } catch {
    return { ...DEFAULT_UNITS };
  }
}
export function saveUnits(u: Units) {
  localStorage.setItem(KEY, JSON.stringify(u));
}

export interface Q {
  v: number;
  unit: string;
}

export const speed = (mps: number, u: Units): Q =>
  u.system === "imperial" ? { v: mps * 2.23694, unit: "mph" } : { v: mps * 3.6, unit: "km/h" };

export const tempC = (f: number, u: Units): Q =>
  u.system === "imperial" ? { v: f, unit: "°F" } : { v: ((f - 32) * 5) / 9, unit: "°C" };

export function power(watts: number, u: Units): Q {
  const v = u.power === "kW" ? watts / 1000 : u.power === "bhp" ? watts / 745.7 : watts / 735.5;
  return { v, unit: u.power };
}

export const distance = (m: number, u: Units): Q =>
  u.system === "imperial" ? { v: m / 1609.34, unit: "mi" } : { v: m / 1000, unit: "km" };

// psi (telemetry native) -> display
export const pressure = (psi: number, u: Units): Q =>
  u.system === "imperial" ? { v: psi, unit: "psi" } : { v: psi * 0.0689476, unit: "bar" };

export const pressureUnit = (u: Units): string => (u.system === "imperial" ? "psi" : "bar");
// step for pressure suggestions, in the user's unit (~1 psi worth)
export const pressureStep = (u: Units): number => (u.system === "imperial" ? 1 : 0.07);
export const lengthShort = (u: Units): string => (u.system === "imperial" ? "in" : "cm");
// step for ride-height suggestions (~1 cm / ~0.4 in)
export const rideStep = (u: Units): number => (u.system === "imperial" ? 0.4 : 1);

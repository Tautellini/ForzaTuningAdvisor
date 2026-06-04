// Shape of the JSON the bridge broadcasts. Mirrors bridge/powershell/bridge.ps1
// (Parse-Packet) and Docs/forza-data-format.md.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TireCorner {
  temp: number; // deg F
  slipRatio: number;
  slipAngle: number;
  combinedSlip: number;
  suspNorm: number; // normalized suspension travel 0..1
  suspM: number; // suspension travel, meters
  wheelSpeed: number; // rad/s
  onRumble: number;
  inPuddle: number;
  surfaceRumble: number;
}

export type CornerKey = "fl" | "fr" | "rl" | "rr";

export interface Telemetry {
  t: number; // timestamp ms
  raceOn: number; // 0 = menu/paused, 1 = driving
  rpm: { cur: number; idle: number; max: number };
  gear: number;
  speed: number; // m/s
  power: number; // W
  torque: number; // Nm
  throttle: number; // 0..1
  brake: number; // 0..1
  clutch: number; // 0..1
  handbrake: number; // 0..1
  steer: number; // -1..1
  boost: number; // psi
  fuel: number; // 0..1
  distance: number; // m
  accel: Vec3; // g-ish (m/s^2 components)
  vel: Vec3;
  angVel: Vec3;
  yaw: number;
  pitch: number;
  roll: number;
  pos: Vec3;
  tires: Record<CornerKey, TireCorner>;
  lap: {
    best: number;
    last: number;
    cur: number;
    raceTime: number;
    num: number;
    pos: number;
  };
  car: {
    ordinal: number;
    class: number;
    pi: number;
    drivetrain: number; // 0 FWD, 1 RWD, 2 AWD
    cylinders: number;
  };
}

export const DRIVETRAIN: Record<number, string> = {
  0: "FWD",
  1: "RWD",
  2: "AWD",
};

export const CORNERS: { key: CornerKey; label: string }[] = [
  { key: "fl", label: "FL" },
  { key: "fr", label: "FR" },
  { key: "rl", label: "RL" },
  { key: "rr", label: "RR" },
];

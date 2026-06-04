import type { CornerKey, Telemetry } from "./types";

// Accumulates bounded running statistics over a whole driving session, updated
// once per frame. Memory stays constant regardless of session length (we keep
// aggregates and binned curves, never the full frame stream).

const RPM_BIN = 250; // power/torque curve resolution

interface GearStat {
  ratioSum: number; // sum of (rpm / speed) in steady cruise -> avg = gear ratio proxy (k)
  ratioCount: number;
  wot: number; // full-throttle frames in this gear
  limiter: number; // full-throttle frames on the rev limiter in this gear
  maxSpeed: number; // m/s
  frames: number;
}

export interface SessionSummary {
  drivingFrames: number;
  durationS: number;
  car: Telemetry["car"];
  maxSpeed: number; // km/h
  maxRpm: number;
  // power curve (per rpm bin: best power W and torque Nm seen)
  powerCurve: { rpm: number; power: number; torque: number }[];
  peakPowerRpm: number;
  peakTorqueRpm: number;
  redline: number;
  gears: Record<number, { k: number; wot: number; limiterFrac: number; maxSpeedKmh: number }>;
  // event fractions (0..1)
  wheelspinFrac: number;
  drivenAxle: "front" | "rear" | "all";
  frontLockFrac: number;
  rearLockFrac: number;
  bottoming: Record<"front" | "rear", number>;
  topping: Record<"front" | "rear", number>;
  understeerRatio: number; // front slip angle / rear slip angle in corners (>1 understeer)
  corneringFrames: number;
  brakingFrames: number;
  powerFrames: number;
  tireTempAvg: Record<CornerKey, number>;
  tireTempMax: Record<CornerKey, number>;
}

const CORNERS: CornerKey[] = ["fl", "fr", "rl", "rr"];

export class SessionAggregator {
  private frames = 0;
  private firstT = 0;
  private lastT = 0;
  private car: Telemetry["car"] | null = null;
  private maxSpeed = 0;
  private maxRpm = 0;
  private redline = 0;

  private power = new Map<number, { power: number; torque: number }>();
  private gears = new Map<number, GearStat>();

  private powerFrames = 0;
  private spinFrames = 0;
  private brakingFrames = 0;
  private frontLock = 0;
  private rearLock = 0;
  private corneringFrames = 0;
  private frontSASum = 0;
  private rearSASum = 0;
  private bottom = { front: 0, rear: 0 };
  private top = { front: 0, rear: 0 };
  private tempSum: Record<CornerKey, number> = { fl: 0, fr: 0, rl: 0, rr: 0 };
  private tempMax: Record<CornerKey, number> = { fl: 0, fr: 0, rl: 0, rr: 0 };

  reset() {
    this.frames = 0;
    this.firstT = 0;
    this.lastT = 0;
    this.car = null;
    this.maxSpeed = 0;
    this.maxRpm = 0;
    this.redline = 0;
    this.power.clear();
    this.gears.clear();
    this.powerFrames = 0;
    this.spinFrames = 0;
    this.brakingFrames = 0;
    this.frontLock = 0;
    this.rearLock = 0;
    this.corneringFrames = 0;
    this.frontSASum = 0;
    this.rearSASum = 0;
    this.bottom = { front: 0, rear: 0 };
    this.top = { front: 0, rear: 0 };
    this.tempSum = { fl: 0, fr: 0, rl: 0, rr: 0 };
    this.tempMax = { fl: 0, fr: 0, rl: 0, rr: 0 };
  }

  get count() {
    return this.frames;
  }

  private drivenKeys(): CornerKey[] {
    const dt = this.car?.drivetrain ?? 2;
    if (dt === 0) return ["fl", "fr"];
    if (dt === 1) return ["rl", "rr"];
    return CORNERS;
  }

  add(f: Telemetry) {
    if (f.raceOn !== 1) return;
    if (this.frames === 0) this.firstT = f.t;
    this.lastT = f.t;
    this.frames++;
    this.car = f.car;
    this.maxSpeed = Math.max(this.maxSpeed, f.speed);
    this.maxRpm = Math.max(this.maxRpm, f.rpm.cur);
    this.redline = Math.max(this.redline, f.rpm.max);

    // power / torque curve
    if (f.rpm.cur > 500 && f.throttle > 0.95) {
      const bin = Math.round(f.rpm.cur / RPM_BIN) * RPM_BIN;
      const prev = this.power.get(bin);
      if (!prev || f.power > prev.power) this.power.set(bin, { power: f.power, torque: f.torque });
    }

    // per-gear stats
    if (f.gear > 0 && f.gear < 11) {
      let g = this.gears.get(f.gear);
      if (!g) {
        g = { ratioSum: 0, ratioCount: 0, wot: 0, limiter: 0, maxSpeed: 0, frames: 0 };
        this.gears.set(f.gear, g);
      }
      g.frames++;
      g.maxSpeed = Math.max(g.maxSpeed, f.speed);
      // steady cruise sample for ratio (rpm per m/s)
      if (f.speed > 8 && f.throttle > 0.2 && f.brake < 0.05) {
        g.ratioSum += f.rpm.cur / f.speed;
        g.ratioCount++;
      }
      if (f.throttle > 0.9 && f.speed > 5) {
        g.wot++;
        if (f.rpm.max > 0 && f.rpm.cur >= 0.985 * f.rpm.max) g.limiter++;
      }
    }

    // wheelspin (driven axle)
    if (f.throttle >= 0.6 && f.speed > 4) {
      this.powerFrames++;
      const driven = this.drivenKeys();
      const slip = driven.reduce((a, k) => a + Math.abs(f.tires[k].slipRatio), 0) / driven.length;
      if (slip >= 0.18) this.spinFrames++;
    }

    // braking lockup
    if (f.brake >= 0.55 && f.speed > 8) {
      this.brakingFrames++;
      const fl = (-f.tires.fl.slipRatio - f.tires.fr.slipRatio) / 2;
      const rl = (-f.tires.rl.slipRatio - f.tires.rr.slipRatio) / 2;
      if (fl >= 0.18) this.frontLock++;
      if (rl >= 0.18) this.rearLock++;
    }

    // cornering balance (slip angles)
    if (Math.abs(f.steer) >= 0.25 && f.speed > 12) {
      this.corneringFrames++;
      this.frontSASum += (Math.abs(f.tires.fl.slipAngle) + Math.abs(f.tires.fr.slipAngle)) / 2;
      this.rearSASum += (Math.abs(f.tires.rl.slipAngle) + Math.abs(f.tires.rr.slipAngle)) / 2;
    }

    // suspension extremes
    if (f.tires.fl.suspNorm >= 0.97 || f.tires.fr.suspNorm >= 0.97) this.bottom.front++;
    if (f.tires.rl.suspNorm >= 0.97 || f.tires.rr.suspNorm >= 0.97) this.bottom.rear++;
    if (f.tires.fl.suspNorm <= 0.03 || f.tires.fr.suspNorm <= 0.03) this.top.front++;
    if (f.tires.rl.suspNorm <= 0.03 || f.tires.rr.suspNorm <= 0.03) this.top.rear++;

    // tire temps
    for (const k of CORNERS) {
      this.tempSum[k] += f.tires[k].temp;
      this.tempMax[k] = Math.max(this.tempMax[k], f.tires[k].temp);
    }
  }

  summary(): SessionSummary | null {
    if (this.frames === 0 || !this.car) return null;
    const f = this.frames;

    const curve = [...this.power.entries()]
      .map(([rpm, v]) => ({ rpm, power: v.power, torque: v.torque }))
      .sort((a, b) => a.rpm - b.rpm);
    let peakPowerRpm = 0,
      peakPower = 0,
      peakTorqueRpm = 0,
      peakTorque = 0;
    for (const p of curve) {
      if (p.power > peakPower) {
        peakPower = p.power;
        peakPowerRpm = p.rpm;
      }
      if (p.torque > peakTorque) {
        peakTorque = p.torque;
        peakTorqueRpm = p.rpm;
      }
    }

    const gears: SessionSummary["gears"] = {};
    for (const [g, s] of this.gears) {
      gears[g] = {
        k: s.ratioCount > 0 ? s.ratioSum / s.ratioCount : 0,
        wot: s.wot,
        limiterFrac: s.wot > 0 ? s.limiter / s.wot : 0,
        maxSpeedKmh: s.maxSpeed * 3.6,
      };
    }

    const dt = this.car.drivetrain;
    const drivenAxle = dt === 0 ? "front" : dt === 1 ? "rear" : "all";

    const avg = (k: CornerKey) => this.tempSum[k] / f;

    return {
      drivingFrames: f,
      durationS: Math.max(0, (this.lastT - this.firstT) / 1000),
      car: this.car,
      maxSpeed: this.maxSpeed * 3.6,
      maxRpm: this.maxRpm,
      powerCurve: curve,
      peakPowerRpm,
      peakTorqueRpm,
      redline: this.redline,
      gears,
      wheelspinFrac: this.powerFrames > 0 ? this.spinFrames / this.powerFrames : 0,
      drivenAxle,
      frontLockFrac: this.brakingFrames > 0 ? this.frontLock / this.brakingFrames : 0,
      rearLockFrac: this.brakingFrames > 0 ? this.rearLock / this.brakingFrames : 0,
      bottoming: { front: this.bottom.front / f, rear: this.bottom.rear / f },
      topping: { front: this.top.front / f, rear: this.top.rear / f },
      understeerRatio: this.rearSASum > 0.001 ? this.frontSASum / this.rearSASum : 1,
      corneringFrames: this.corneringFrames,
      brakingFrames: this.brakingFrames,
      powerFrames: this.powerFrames,
      tireTempAvg: { fl: avg("fl"), fr: avg("fr"), rl: avg("rl"), rr: avg("rr") },
      tireTempMax: { ...this.tempMax },
    };
  }
}

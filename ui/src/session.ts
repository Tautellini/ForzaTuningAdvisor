import type { CornerKey, Telemetry } from "./types";

// Session data is a plain, serializable, MERGEABLE bag of running statistics.
// One per recorded session; multiple can be merged for a combined calculation.

const RPM_BIN = 250;
const CORNERS: CornerKey[] = ["fl", "fr", "rl", "rr"];

interface GearStat {
  ratioSum: number;
  ratioCount: number;
  wot: number;
  limiter: number;
  maxSpeed: number;
  frames: number;
}

export interface SessionData {
  frames: number;
  firstT: number;
  lastT: number;
  /**
   * Actual driving time in ms — sum of per-frame deltas (gaps over 250ms
   * don't count, so pauses/menus/game-clock resets are excluded). Sessions
   * stored before this field exist without it; readers fall back to the
   * lastT-firstT window.
   */
  durMs: number;
  car: Telemetry["car"] | null;
  maxSpeed: number;
  maxRpm: number;
  redline: number;
  power: Record<number, { power: number; torque: number }>;
  gears: Record<number, GearStat>;
  powerFrames: number;
  spinFrames: number;
  frontSpin: number;
  rearSpin: number;
  brakingFrames: number; // any braking (>=15% pedal) at speed
  frontLock: number;
  rearLock: number;
  // pedal position at the moment of lockup — locking at LOW pedal means the
  // pressure is far too high, a stronger signal than locking at a full stomp
  lockFrames: number;
  lockPedalSum: number;
  // mid-corner throttle lifts and whether the rear stepped out right after
  // (lift-off oversteer -> decel diff advice)
  liftEvents: number;
  liftOS: number;
  lastThr: number; // transient
  liftWin: number; // transient: frames left in the post-lift watch window
  liftFlagged: number; // transient: this lift already counted
  corneringFrames: number;
  frontSASum: number;
  rearSASum: number;
  // straight-line scrub (toe estimate): slip angle with the steering centered
  // at speed — static toe shows up as a constant per-axle slip angle
  straightF: number;
  straightFSA: number;
  straightRSA: number;
  // pitch usage: how deep the suspension sits under hard braking / hard power
  hardBrakeF: number;
  diveF: number;
  hardPowerF: number;
  squatF: number;
  maxLatG: number;
  nearLimit: number;
  hsCorner: number;
  hsNearLimit: number;
  hsFrontSA: number;
  hsRearSA: number;
  hardCorner: number; // cornering frames under real lateral load
  frontRollSum: number; // sum of |FL-FR| suspension travel (m) under load
  rearRollSum: number;
  maxRoll: number; // peak chassis roll (rad) under load
  // corner-phase balance (front/rear slip-angle sums per phase)
  entryF: number;
  entryFSA: number;
  entryRSA: number;
  midF: number;
  midFSA: number;
  midRSA: number;
  exitF: number;
  exitFSA: number;
  exitRSA: number;
  // low- vs high-speed balance (for mechanical vs aero)
  lowF: number;
  lowFSA: number;
  lowRSA: number;
  // damping: suspension-travel direction reversals (oscillation)
  frontRev: number;
  rearRev: number;
  lastFront: number;
  lastRear: number;
  frontDir: number;
  rearDir: number;
  bottomFront: number;
  bottomRear: number;
  topFront: number;
  topRear: number;
  tempSum: Record<CornerKey, number>;
  tempMax: Record<CornerKey, number>;
}

export interface SessionSummary {
  drivingFrames: number;
  durationS: number;
  car: Telemetry["car"];
  maxRpm: number;
  powerCurve: { rpm: number; power: number; torque: number }[];
  peakPowerRpm: number;
  peakTorqueRpm: number;
  redline: number;
  gears: Record<number, { k: number; wot: number; limiterFrac: number; maxSpeedKmh: number }>;
  wheelspinFrac: number;
  frontSpinFrac: number;
  rearSpinFrac: number;
  drivenAxle: "front" | "rear" | "all";
  frontLockFrac: number;
  rearLockFrac: number;
  lockFrames: number; // frames with any axle locked while braking
  lockPedalAvg: number; // average brake-pedal position during those frames
  liftEvents: number; // mid-corner throttle lifts
  liftOversteerFrac: number; // fraction where the rear stepped out after the lift
  bottoming: Record<"front" | "rear", number>;
  topping: Record<"front" | "rear", number>;
  understeerRatio: number;
  avgRearSlipAngle: number;
  straightFrames: number; // steering centered, at speed, clean surface
  frontScrubDeg: number; // avg straight-line slip angle per axle ≈ toe scrub
  rearScrubDeg: number;
  hardBrakeFrames: number; // >=50% pedal, clean
  diveFrac: number; // fraction of those with the front deep in its travel
  hardPowerFrames: number; // >=80% throttle, clean
  squatFrac: number; // fraction of those with the rear deep in its travel
  corneringFrames: number;
  hardCornerFrames: number;
  frontRollDeg: number; // estimated front body roll under load
  rearRollDeg: number;
  entryFrames: number;
  midFrames: number;
  exitFrames: number;
  entryUndersteer: number; // front/rear slip-angle ratio per phase (>1 understeer)
  midUndersteer: number;
  exitUndersteer: number;
  lowSpeedUndersteer: number; // balance below ~108 km/h (vs highSpeedUndersteerRatio)
  lowSpeedCornerFrames: number;
  frontReversalRate: number; // suspension oscillations / second (damping)
  rearReversalRate: number;
  brakingFrames: number;
  powerFrames: number;
  maxLatG: number;
  nearLimitFrac: number;
  highSpeedCornerFrames: number;
  highSpeedNearLimitFrac: number;
  highSpeedUndersteerRatio: number;
  tireTempAvg: Record<CornerKey, number>;
}

export function emptyData(): SessionData {
  return {
    frames: 0,
    firstT: 0,
    lastT: 0,
    durMs: 0,
    car: null,
    maxSpeed: 0,
    maxRpm: 0,
    redline: 0,
    power: {},
    gears: {},
    powerFrames: 0,
    spinFrames: 0,
    frontSpin: 0,
    rearSpin: 0,
    brakingFrames: 0,
    frontLock: 0,
    rearLock: 0,
    lockFrames: 0,
    lockPedalSum: 0,
    liftEvents: 0,
    liftOS: 0,
    lastThr: 0,
    liftWin: 0,
    liftFlagged: 0,
    corneringFrames: 0,
    frontSASum: 0,
    rearSASum: 0,
    straightF: 0,
    straightFSA: 0,
    straightRSA: 0,
    hardBrakeF: 0,
    diveF: 0,
    hardPowerF: 0,
    squatF: 0,
    maxLatG: 0,
    nearLimit: 0,
    hsCorner: 0,
    hsNearLimit: 0,
    hsFrontSA: 0,
    hsRearSA: 0,
    hardCorner: 0,
    frontRollSum: 0,
    rearRollSum: 0,
    maxRoll: 0,
    entryF: 0,
    entryFSA: 0,
    entryRSA: 0,
    midF: 0,
    midFSA: 0,
    midRSA: 0,
    exitF: 0,
    exitFSA: 0,
    exitRSA: 0,
    lowF: 0,
    lowFSA: 0,
    lowRSA: 0,
    frontRev: 0,
    rearRev: 0,
    lastFront: 0,
    lastRear: 0,
    frontDir: 0,
    rearDir: 0,
    bottomFront: 0,
    bottomRear: 0,
    topFront: 0,
    topRear: 0,
    tempSum: { fl: 0, fr: 0, rl: 0, rr: 0 },
    tempMax: { fl: 0, fr: 0, rl: 0, rr: 0 },
  };
}

function drivenKeys(dt: number): CornerKey[] {
  if (dt === 0) return ["fl", "fr"];
  if (dt === 1) return ["rl", "rr"];
  return CORNERS;
}

/** Accumulate one driving frame into a SessionData (mutates). Ignores idle frames. */
export function addFrame(d: SessionData, f: Telemetry): void {
  if (f.raceOn !== 1) return;
  if (d.frames === 0) {
    d.firstT = f.t;
  } else {
    const dt = f.t - d.lastT;
    if (dt > 0 && dt <= 250) d.durMs = (d.durMs ?? 0) + dt;
  }
  d.lastT = f.t;
  d.frames++;
  d.car = f.car;
  d.maxSpeed = Math.max(d.maxSpeed, f.speed);
  d.maxRpm = Math.max(d.maxRpm, f.rpm.cur);
  d.redline = Math.max(d.redline, f.rpm.max);

  // "Clean" frame = not on a kerb / in a puddle / over rough surface. We exclude
  // these from suspension/damping/roll metrics so bumps don't masquerade as setup.
  const T = f.tires;
  const clean =
    T.fl.onRumble === 0 && T.fr.onRumble === 0 && T.rl.onRumble === 0 && T.rr.onRumble === 0 &&
    T.fl.inPuddle === 0 && T.fr.inPuddle === 0 && T.rl.inPuddle === 0 && T.rr.inPuddle === 0 &&
    Math.max(T.fl.surfaceRumble, T.fr.surfaceRumble, T.rl.surfaceRumble, T.rr.surfaceRumble) < 0.3;

  if (f.rpm.cur > 500 && f.throttle > 0.95) {
    const bin = Math.round(f.rpm.cur / RPM_BIN) * RPM_BIN;
    const prev = d.power[bin];
    if (!prev || f.power > prev.power) d.power[bin] = { power: f.power, torque: f.torque };
  }

  if (f.gear > 0 && f.gear < 11) {
    let g = d.gears[f.gear];
    if (!g) {
      g = { ratioSum: 0, ratioCount: 0, wot: 0, limiter: 0, maxSpeed: 0, frames: 0 };
      d.gears[f.gear] = g;
    }
    g.frames++;
    g.maxSpeed = Math.max(g.maxSpeed, f.speed);
    if (f.speed > 8 && f.throttle > 0.2 && f.brake < 0.05) {
      g.ratioSum += f.rpm.cur / f.speed;
      g.ratioCount++;
    }
    if (f.throttle > 0.9 && f.speed > 5) {
      g.wot++;
      if (f.rpm.max > 0 && f.rpm.cur >= 0.985 * f.rpm.max) g.limiter++;
    }
  }

  if (f.throttle >= 0.6 && f.speed > 4) {
    d.powerFrames++;
    const driven = drivenKeys(f.car.drivetrain);
    const slip = driven.reduce((a, k) => a + Math.abs(f.tires[k].slipRatio), 0) / driven.length;
    if (slip >= 0.18) d.spinFrames++;
    const fSlip = (Math.abs(f.tires.fl.slipRatio) + Math.abs(f.tires.fr.slipRatio)) / 2;
    const rSlip = (Math.abs(f.tires.rl.slipRatio) + Math.abs(f.tires.rr.slipRatio)) / 2;
    if (fSlip >= 0.18) d.frontSpin++;
    if (rSlip >= 0.18) d.rearSpin++;
  }

  // Braking: ANY pedal counts as evidence (a 15–55% "trail braking" band was
  // collected separately before, but a trigger sweeps through any band in a
  // blink — the gate never filled). Pressure problems are detected from the
  // pedal position at the moment of lockup instead.
  if (f.speed > 8 && f.brake >= 0.15) {
    d.brakingFrames++;
    const fl = (-f.tires.fl.slipRatio - f.tires.fr.slipRatio) / 2;
    const rl = (-f.tires.rl.slipRatio - f.tires.rr.slipRatio) / 2;
    if (fl >= 0.18) d.frontLock++;
    if (rl >= 0.18) d.rearLock++;
    if (fl >= 0.18 || rl >= 0.18) {
      d.lockFrames = (d.lockFrames ?? 0) + 1;
      d.lockPedalSum = (d.lockPedalSum ?? 0) + f.brake;
    }
  }

  // Straight-line scrub (toe estimate): with the steering centered at speed
  // on a clean surface, a constant per-axle slip angle ≈ the static toe.
  if (clean && Math.abs(f.steer) < 0.04 && f.speed > 20 && f.brake < 0.05) {
    d.straightF = (d.straightF ?? 0) + 1;
    d.straightFSA =
      (d.straightFSA ?? 0) + (Math.abs(f.tires.fl.slipAngle) + Math.abs(f.tires.fr.slipAngle)) / 2;
    d.straightRSA =
      (d.straightRSA ?? 0) + (Math.abs(f.tires.rl.slipAngle) + Math.abs(f.tires.rr.slipAngle)) / 2;
  }

  // Pitch usage: nose-dive under hard braking, rear squat under hard power.
  // Deep travel here (not bottomed, just deep) = springs soft for the load.
  if (clean && f.brake >= 0.5 && f.speed > 8) {
    d.hardBrakeF = (d.hardBrakeF ?? 0) + 1;
    if ((f.tires.fl.suspNorm + f.tires.fr.suspNorm) / 2 >= 0.85) d.diveF = (d.diveF ?? 0) + 1;
  }
  if (clean && f.throttle >= 0.8 && f.speed > 4) {
    d.hardPowerF = (d.hardPowerF ?? 0) + 1;
    if ((f.tires.rl.suspNorm + f.tires.rr.suspNorm) / 2 >= 0.85) d.squatF = (d.squatF ?? 0) + 1;
  }

  // Lift-off oversteer probe: a throttle lift while cornering opens a short
  // watch window; the rear letting go inside it counts as one event.
  const corneringNow = Math.abs(f.steer) >= 0.25 && f.speed > 12;
  if (corneringNow && (d.lastThr ?? 0) > 0.4 && f.throttle < 0.1) {
    d.liftEvents = (d.liftEvents ?? 0) + 1;
    d.liftWin = 30; // ~0.3–0.5s depending on feed rate
    d.liftFlagged = 0;
  }
  if ((d.liftWin ?? 0) > 0) {
    d.liftWin!--;
    const fSAw = (Math.abs(f.tires.fl.slipAngle) + Math.abs(f.tires.fr.slipAngle)) / 2;
    const rSAw = (Math.abs(f.tires.rl.slipAngle) + Math.abs(f.tires.rr.slipAngle)) / 2;
    if (!d.liftFlagged && rSAw > fSAw * 1.4 && rSAw > 0.06) {
      d.liftOS = (d.liftOS ?? 0) + 1;
      d.liftFlagged = 1;
    }
  }
  d.lastThr = f.throttle;

  d.maxLatG = Math.max(d.maxLatG, Math.abs(f.accel.x) / 9.81);

  if (Math.abs(f.steer) >= 0.25 && f.speed > 12) {
    d.corneringFrames++;
    const frontSA = (Math.abs(f.tires.fl.slipAngle) + Math.abs(f.tires.fr.slipAngle)) / 2;
    const rearSA = (Math.abs(f.tires.rl.slipAngle) + Math.abs(f.tires.rr.slipAngle)) / 2;
    d.frontSASum += frontSA;
    d.rearSASum += rearSA;
    const maxCombined = Math.max(
      f.tires.fl.combinedSlip,
      f.tires.fr.combinedSlip,
      f.tires.rl.combinedSlip,
      f.tires.rr.combinedSlip,
    );
    if (maxCombined >= 0.9) d.nearLimit++;
    if (f.speed >= 30) {
      d.hsCorner++;
      if (maxCombined >= 0.9) d.hsNearLimit++;
      d.hsFrontSA += frontSA;
      d.hsRearSA += rearSA;
    } else {
      d.lowF++;
      d.lowFSA += frontSA;
      d.lowRSA += rearSA;
    }
    // Corner phase: entry (trail-braking/turn-in), exit (on power), mid (neither).
    if (f.brake >= 0.2) {
      d.entryF++;
      d.entryFSA += frontSA;
      d.entryRSA += rearSA;
    } else if (f.throttle >= 0.45) {
      d.exitF++;
      d.exitFSA += frontSA;
      d.exitRSA += rearSA;
    } else {
      d.midF++;
      d.midFSA += frontSA;
      d.midRSA += rearSA;
    }
    // Body roll for camber estimation — under real lateral load, clean surface only.
    if (clean && Math.abs(f.accel.x) / 9.81 >= 0.5) {
      d.hardCorner++;
      d.frontRollSum += Math.abs(f.tires.fl.suspM - f.tires.fr.suspM);
      d.rearRollSum += Math.abs(f.tires.rl.suspM - f.tires.rr.suspM);
      d.maxRoll = Math.max(d.maxRoll, Math.abs(f.roll));
    }
  }

  // Bottoming / topping — clean surface only (kerbs & bumps cause spikes).
  if (clean) {
    if (f.tires.fl.suspNorm >= 0.97 || f.tires.fr.suspNorm >= 0.97) d.bottomFront++;
    if (f.tires.rl.suspNorm >= 0.97 || f.tires.rr.suspNorm >= 0.97) d.bottomRear++;
    if (f.tires.fl.suspNorm <= 0.03 || f.tires.fr.suspNorm <= 0.03) d.topFront++;
    if (f.tires.rl.suspNorm <= 0.03 || f.tires.rr.suspNorm <= 0.03) d.topRear++;
  }

  for (const k of CORNERS) {
    d.tempSum[k] += f.tires[k].temp;
    d.tempMax[k] = Math.max(d.tempMax[k], f.tires[k].temp);
  }

  // Damping: suspension-travel direction reversals (oscillation) — clean only.
  const ft = (f.tires.fl.suspNorm + f.tires.fr.suspNorm) / 2;
  const rt = (f.tires.rl.suspNorm + f.tires.rr.suspNorm) / 2;
  if (d.frames > 1 && clean) {
    const fd = ft - d.lastFront;
    if (Math.abs(fd) > 0.015) {
      const dir = fd > 0 ? 1 : -1;
      if (d.frontDir !== 0 && dir !== d.frontDir) d.frontRev++;
      d.frontDir = dir;
    }
    const rd = rt - d.lastRear;
    if (Math.abs(rd) > 0.015) {
      const dir = rd > 0 ? 1 : -1;
      if (d.rearDir !== 0 && dir !== d.rearDir) d.rearRev++;
      d.rearDir = dir;
    }
  }
  d.lastFront = ft;
  d.lastRear = rt;
}

/** Merge several SessionData into one combined bag. */
export function mergeData(ds: SessionData[]): SessionData {
  const out = emptyData();
  let firstSet = false;
  for (const d of ds) {
    if (d.frames === 0) continue;
    if (!firstSet) {
      out.firstT = d.firstT;
      firstSet = true;
    }
    out.lastT = Math.max(out.lastT, d.lastT);
    out.durMs += drivingMs(d); // durations SUM across sessions, windows don't
    out.frames += d.frames;
    if (d.car) out.car = d.car;
    out.maxSpeed = Math.max(out.maxSpeed, d.maxSpeed);
    out.maxRpm = Math.max(out.maxRpm, d.maxRpm);
    out.redline = Math.max(out.redline, d.redline);
    out.powerFrames += d.powerFrames;
    out.spinFrames += d.spinFrames;
    out.frontSpin += d.frontSpin;
    out.rearSpin += d.rearSpin;
    out.brakingFrames += d.brakingFrames;
    out.frontLock += d.frontLock;
    out.rearLock += d.rearLock;
    // ?? guards: sessions stored before these stats existed
    out.lockFrames += d.lockFrames ?? 0;
    out.lockPedalSum += d.lockPedalSum ?? 0;
    out.liftEvents += d.liftEvents ?? 0;
    out.liftOS += d.liftOS ?? 0;
    out.corneringFrames += d.corneringFrames;
    out.frontSASum += d.frontSASum;
    out.rearSASum += d.rearSASum;
    out.straightF += d.straightF ?? 0;
    out.straightFSA += d.straightFSA ?? 0;
    out.straightRSA += d.straightRSA ?? 0;
    out.hardBrakeF += d.hardBrakeF ?? 0;
    out.diveF += d.diveF ?? 0;
    out.hardPowerF += d.hardPowerF ?? 0;
    out.squatF += d.squatF ?? 0;
    out.maxLatG = Math.max(out.maxLatG, d.maxLatG);
    out.nearLimit += d.nearLimit;
    out.hsCorner += d.hsCorner;
    out.hsNearLimit += d.hsNearLimit;
    out.hsFrontSA += d.hsFrontSA;
    out.hsRearSA += d.hsRearSA;
    out.hardCorner += d.hardCorner;
    out.frontRollSum += d.frontRollSum;
    out.rearRollSum += d.rearRollSum;
    out.maxRoll = Math.max(out.maxRoll, d.maxRoll);
    out.entryF += d.entryF;
    out.entryFSA += d.entryFSA;
    out.entryRSA += d.entryRSA;
    out.midF += d.midF;
    out.midFSA += d.midFSA;
    out.midRSA += d.midRSA;
    out.exitF += d.exitF;
    out.exitFSA += d.exitFSA;
    out.exitRSA += d.exitRSA;
    out.lowF += d.lowF;
    out.lowFSA += d.lowFSA;
    out.lowRSA += d.lowRSA;
    out.frontRev += d.frontRev;
    out.rearRev += d.rearRev;
    out.bottomFront += d.bottomFront;
    out.bottomRear += d.bottomRear;
    out.topFront += d.topFront;
    out.topRear += d.topRear;
    for (const k of CORNERS) {
      out.tempSum[k] += d.tempSum[k];
      out.tempMax[k] = Math.max(out.tempMax[k], d.tempMax[k]);
    }
    for (const [binStr, v] of Object.entries(d.power)) {
      const bin = Number(binStr);
      const prev = out.power[bin];
      if (!prev || v.power > prev.power) out.power[bin] = { ...v };
    }
    for (const [gStr, g] of Object.entries(d.gears)) {
      const gn = Number(gStr);
      const cur = out.gears[gn] ?? { ratioSum: 0, ratioCount: 0, wot: 0, limiter: 0, maxSpeed: 0, frames: 0 };
      cur.ratioSum += g.ratioSum;
      cur.ratioCount += g.ratioCount;
      cur.wot += g.wot;
      cur.limiter += g.limiter;
      cur.frames += g.frames;
      cur.maxSpeed = Math.max(cur.maxSpeed, g.maxSpeed);
      out.gears[gn] = cur;
    }
  }
  return out;
}

/** Driving time of one data bag, with a fallback for pre-durMs stored sessions. */
function drivingMs(d: SessionData): number {
  return (d.durMs ?? 0) > 0 ? d.durMs : Math.max(0, d.lastT - d.firstT);
}

/** Compute a SessionSummary from a (possibly merged) SessionData. */
export function summarize(d: SessionData): SessionSummary | null {
  if (d.frames === 0 || !d.car) return null;
  const f = d.frames;
  const durS = drivingMs(d) / 1000;

  const curve = Object.entries(d.power)
    .map(([rpm, v]) => ({ rpm: Number(rpm), power: v.power, torque: v.torque }))
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
  for (const [g, s] of Object.entries(d.gears)) {
    gears[Number(g)] = {
      k: s.ratioCount > 0 ? s.ratioSum / s.ratioCount : 0,
      wot: s.wot,
      limiterFrac: s.wot > 0 ? s.limiter / s.wot : 0,
      maxSpeedKmh: s.maxSpeed * 3.6,
    };
  }

  const dt = d.car.drivetrain;
  const drivenAxle = dt === 0 ? "front" : dt === 1 ? "rear" : "all";
  const avg = (k: CornerKey) => d.tempSum[k] / f;

  return {
    drivingFrames: f,
    durationS: durS,
    car: d.car,
    maxRpm: d.maxRpm,
    powerCurve: curve,
    peakPowerRpm,
    peakTorqueRpm,
    redline: d.redline,
    gears,
    wheelspinFrac: d.powerFrames > 0 ? d.spinFrames / d.powerFrames : 0,
    frontSpinFrac: d.powerFrames > 0 ? d.frontSpin / d.powerFrames : 0,
    rearSpinFrac: d.powerFrames > 0 ? d.rearSpin / d.powerFrames : 0,
    drivenAxle,
    frontLockFrac: d.brakingFrames > 0 ? d.frontLock / d.brakingFrames : 0,
    rearLockFrac: d.brakingFrames > 0 ? d.rearLock / d.brakingFrames : 0,
    lockFrames: d.lockFrames ?? 0,
    lockPedalAvg: (d.lockFrames ?? 0) > 0 ? (d.lockPedalSum ?? 0) / d.lockFrames : 0,
    liftEvents: d.liftEvents ?? 0,
    liftOversteerFrac: (d.liftEvents ?? 0) > 0 ? (d.liftOS ?? 0) / d.liftEvents : 0,
    bottoming: { front: d.bottomFront / f, rear: d.bottomRear / f },
    topping: { front: d.topFront / f, rear: d.topRear / f },
    understeerRatio: d.rearSASum > 0.001 ? d.frontSASum / d.rearSASum : 1,
    avgRearSlipAngle: d.corneringFrames > 0 ? d.rearSASum / d.corneringFrames : 0,
    straightFrames: d.straightF ?? 0,
    frontScrubDeg:
      (d.straightF ?? 0) > 0 ? (((d.straightFSA ?? 0) / d.straightF) * 180) / Math.PI : 0,
    rearScrubDeg:
      (d.straightF ?? 0) > 0 ? (((d.straightRSA ?? 0) / d.straightF) * 180) / Math.PI : 0,
    hardBrakeFrames: d.hardBrakeF ?? 0,
    diveFrac: (d.hardBrakeF ?? 0) > 0 ? (d.diveF ?? 0) / d.hardBrakeF : 0,
    hardPowerFrames: d.hardPowerF ?? 0,
    squatFrac: (d.hardPowerF ?? 0) > 0 ? (d.squatF ?? 0) / d.hardPowerF : 0,
    corneringFrames: d.corneringFrames,
    hardCornerFrames: d.hardCorner,
    frontRollDeg:
      d.hardCorner > 0 ? (Math.atan(d.frontRollSum / d.hardCorner / 1.55) * 180) / Math.PI : 0,
    rearRollDeg:
      d.hardCorner > 0 ? (Math.atan(d.rearRollSum / d.hardCorner / 1.55) * 180) / Math.PI : 0,
    entryFrames: d.entryF,
    midFrames: d.midF,
    exitFrames: d.exitF,
    entryUndersteer: d.entryRSA > 0.001 ? d.entryFSA / d.entryRSA : 1,
    midUndersteer: d.midRSA > 0.001 ? d.midFSA / d.midRSA : 1,
    exitUndersteer: d.exitRSA > 0.001 ? d.exitFSA / d.exitRSA : 1,
    lowSpeedUndersteer: d.lowRSA > 0.001 ? d.lowFSA / d.lowRSA : 1,
    lowSpeedCornerFrames: d.lowF,
    frontReversalRate: d.frontRev / Math.max(1, durS),
    rearReversalRate: d.rearRev / Math.max(1, durS),
    brakingFrames: d.brakingFrames,
    powerFrames: d.powerFrames,
    maxLatG: d.maxLatG,
    nearLimitFrac: d.corneringFrames > 0 ? d.nearLimit / d.corneringFrames : 0,
    highSpeedCornerFrames: d.hsCorner,
    highSpeedNearLimitFrac: d.hsCorner > 0 ? d.hsNearLimit / d.hsCorner : 0,
    highSpeedUndersteerRatio: d.hsRearSA > 0.001 ? d.hsFrontSA / d.hsRearSA : 1,
    tireTempAvg: { fl: avg("fl"), fr: avg("fr"), rl: avg("rl"), rr: avg("rr") },
  };
}

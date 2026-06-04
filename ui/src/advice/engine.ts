import type { SessionSummary } from "../session";
import type { CurrentTune } from "../tune";

export type Confidence = "high" | "medium" | "low";

export interface Advice {
  id: string;
  area: string;
  confidence: Confidence;
  message: string;
  /** Concrete recommendation (number / target), shown prominently when present. */
  value?: string;
  detail?: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (x: number) => `${Math.round(x * 100)}%`;

// Minimum evidence before a rule speaks.
const MIN = { frames: 120, gearPair: 2, braking: 20, cornering: 40, power: 30, curve: 4 };

/** Linear-interpolated power (W) at an arbitrary rpm, from the session power curve. */
function powerAt(curve: SessionSummary["powerCurve"], rpm: number): number {
  if (curve.length === 0) return 0;
  if (rpm <= curve[0].rpm) return curve[0].power;
  if (rpm >= curve[curve.length - 1].rpm) return curve[curve.length - 1].power;
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i].rpm) {
      const a = curve[i - 1];
      const b = curve[i];
      const f = (rpm - a.rpm) / (b.rpm - a.rpm);
      return a.power + f * (b.power - a.power);
    }
  }
  return curve[curve.length - 1].power;
}

/**
 * Optimal upshift rpm from gear g to g+1: the rpm where holding gear g no longer
 * makes more wheel power than shifting. ratioDrop = k(g+1)/k(g) = rpm-after / rpm-before.
 * Found as the equal-power crossover on the measured power curve.
 */
function optimalShiftRpm(
  curve: SessionSummary["powerCurve"],
  redline: number,
  peakPowerRpm: number,
  ratioDrop: number,
): number {
  for (let R = Math.max(peakPowerRpm, 2000); R <= redline; R += 50) {
    if (powerAt(curve, R) <= powerAt(curve, R * ratioDrop)) return R;
  }
  return redline; // power still rising — shift at redline
}

export function analyzeSession(s: SessionSummary | null, tune: CurrentTune): Advice[] {
  if (!s || s.drivingFrames < MIN.frames) return [];
  const out: Advice[] = [];

  // ---- Gearing: optimal shift points (HIGH, concrete, telemetry-only) -------
  const gearNums = Object.keys(s.gears)
    .map(Number)
    .filter((g) => s.gears[g].k > 0)
    .sort((a, b) => a - b);
  if (s.powerCurve.length >= MIN.curve && s.peakPowerRpm > 0 && gearNums.length >= MIN.gearPair) {
    const shifts: string[] = [];
    for (let i = 0; i < gearNums.length - 1; i++) {
      const g = gearNums[i];
      const next = gearNums[i + 1];
      if (next !== g + 1) continue;
      const drop = s.gears[next].k / s.gears[g].k; // <1
      if (drop <= 0 || drop >= 1) continue;
      const R = optimalShiftRpm(s.powerCurve, s.redline || s.maxRpm, s.peakPowerRpm, drop);
      shifts.push(`${g}→${next}: ${r0(R / 50) * 50} rpm`);
    }
    if (shifts.length > 0) {
      out.push({
        id: "gearing-shift-points",
        area: "Gearing — shift points",
        confidence: "high",
        value: shifts.join("   ·   "),
        message:
          "Upshift at these RPMs for the most acceleration (computed from your measured power curve this session).",
        detail: `Peak power ≈ ${r0(s.peakPowerRpm)} rpm, peak torque ≈ ${r0(s.peakTorqueRpm)} rpm, redline ≈ ${r0(s.redline)} rpm.`,
      });
    }
  }

  // ---- Gearing: hitting limiter in the top gear (HIGH) ----------------------
  const topGear = gearNums[gearNums.length - 1];
  if (topGear && s.gears[topGear].wot > 30 && s.gears[topGear].limiterFrac >= 0.15) {
    const lengthen = clamp(s.gears[topGear].limiterFrac, 0.05, 0.12); // 5–12%
    const value =
      tune.finalDrive != null
        ? `Final drive ${r2(tune.finalDrive)} → ~${r2(tune.finalDrive * (1 - lengthen))}`
        : `Lengthen top gear / final drive by ~${pct(lengthen)}`;
    out.push({
      id: "gearing-limiter-top",
      area: "Gearing — top end",
      confidence: "high",
      value,
      message: `You bounce off the rev limiter in gear ${topGear} on straights — gearing is too short up top. Make it taller so you keep pulling.`,
      detail: `On the limiter ${pct(s.gears[topGear].limiterFrac)} of full-throttle time in gear ${topGear} (max ${r0(s.gears[topGear].maxSpeedKmh)} km/h).`,
    });
  }

  // ---- Brakes: lockup + balance (HIGH, concrete %) --------------------------
  if (s.brakingFrames >= MIN.braking) {
    if (s.frontLockFrac >= 0.12 && s.frontLockFrac >= s.rearLockFrac) {
      const shift = clamp(r0(s.frontLockFrac * 20), 2, 10);
      const value =
        tune.brakeBalance != null
          ? `Brake balance ${r0(tune.brakeBalance)}% → ~${r0(tune.brakeBalance - shift)}% front`
          : `Move brake balance ~${shift}% rearward`;
      out.push({
        id: "brake-front-lock",
        area: "Brakes",
        confidence: "high",
        value,
        message:
          "Front wheels lock under braking, so you lose steering. Shift brake balance rearward (or lower brake pressure).",
        detail: `Front lockup in ${pct(s.frontLockFrac)} of braking.`,
      });
    } else if (s.rearLockFrac >= 0.12 && s.rearLockFrac > s.frontLockFrac) {
      const shift = clamp(r0(s.rearLockFrac * 20), 2, 10);
      const value =
        tune.brakeBalance != null
          ? `Brake balance ${r0(tune.brakeBalance)}% → ~${r0(tune.brakeBalance + shift)}% front`
          : `Move brake balance ~${shift}% forward`;
      out.push({
        id: "brake-rear-lock",
        area: "Brakes",
        confidence: "high",
        value,
        message:
          "Rear wheels lock under braking (can snap the back loose). Shift brake balance forward (or lower brake pressure).",
        detail: `Rear lockup in ${pct(s.rearLockFrac)} of braking.`,
      });
    }
  }

  // ---- Differential: wheelspin under power (HIGH) ---------------------------
  if (s.powerFrames >= MIN.power && s.wheelspinFrac >= 0.15) {
    const drop = clamp(r0(s.wheelspinFrac * 30), 5, 20);
    const value =
      tune.diffAccel != null
        ? `Diff acceleration ${r0(tune.diffAccel)}% → ~${r0(tune.diffAccel - drop)}%`
        : `Lower diff acceleration by ~${drop}%`;
    out.push({
      id: "diff-wheelspin",
      area: "Differential",
      confidence: "high",
      value,
      message: `The ${s.drivenAxle} axle spins up under power. Soften the differential acceleration lock for cleaner drive (or you're simply past the tires' grip — be smoother on throttle).`,
      detail: `Wheelspin in ${pct(s.wheelspinFrac)} of on-power frames.`,
    });
  }

  // ---- Springs / ride height: bottoming out (HIGH) -------------------------
  for (const end of ["front", "rear"] as const) {
    if (s.bottoming[end] >= 0.06) {
      const rhKey = end === "front" ? "frontRideHeight" : "rearRideHeight";
      const value =
        tune[rhKey] != null
          ? `${end[0].toUpperCase() + end.slice(1)} ride height ${r1(tune[rhKey]!)} → ~${r1(tune[rhKey]! + 1)}`
          : `Raise ${end} ride height (or stiffen ${end} springs ~10%)`;
      out.push({
        id: `bottoming-${end}`,
        area: "Springs / Ride height",
        confidence: "high",
        value,
        message: `Suspension bottoms out at the ${end} — it's slamming into the bump stops. Raise ride height or stiffen the ${end} springs.`,
        detail: `Fully compressed ${pct(s.bottoming[end])} of the time.`,
      });
      break;
    }
  }

  // ---- Handling balance: under / oversteer (MEDIUM) ------------------------
  if (s.corneringFrames >= MIN.cornering) {
    if (s.understeerRatio >= 1.5) {
      const step = clamp(r0((s.understeerRatio - 1) * 10), 2, 15);
      const value =
        tune.frontARB != null
          ? `Front ARB ${r0(tune.frontARB)} → ~${r0(clamp(tune.frontARB - step, 1, 65))}`
          : `Soften front ARB (or stiffen rear)`;
      out.push({
        id: "balance-understeer",
        area: "Handling balance",
        confidence: "medium",
        value,
        message:
          "Car understeers (pushes) — fronts slip more than rears mid-corner. Soften the front anti-roll bar (or stiffen the rear).",
        detail: `Front slip angle ≈ ${r1(s.understeerRatio)}× the rear in corners.`,
      });
    } else if (s.understeerRatio > 0 && s.understeerRatio <= 0.67) {
      const ratio = 1 / s.understeerRatio;
      const step = clamp(r0((ratio - 1) * 10), 2, 15);
      const value =
        tune.frontARB != null
          ? `Front ARB ${r0(tune.frontARB)} → ~${r0(clamp(tune.frontARB + step, 1, 65))}`
          : `Stiffen front ARB (or soften rear)`;
      out.push({
        id: "balance-oversteer",
        area: "Handling balance",
        confidence: "medium",
        value,
        message:
          "Car oversteers (loose) — rears slip more than fronts mid-corner. Stiffen the front anti-roll bar (or soften the rear), and ease diff acceleration.",
        detail: `Rear slip angle ≈ ${r1(ratio)}× the front in corners.`,
      });
    }
  }

  // ---- Wheel unloading / too stiff (MEDIUM) --------------------------------
  for (const end of ["front", "rear"] as const) {
    if (s.topping[end] >= 0.1) {
      out.push({
        id: `unload-${end}`,
        area: "Springs / Ride height",
        confidence: "medium",
        message: `The ${end} keeps topping out (wheels unloading). The ${end} may be too stiff or ride height too low — try softening ${end} springs.`,
        detail: `Fully extended ${pct(s.topping[end])} of the time.`,
      });
      break;
    }
  }

  // ---- Tire temperature window (LOW — proxy, no pressure data) --------------
  const hot = (["fl", "fr", "rl", "rr"] as const).filter((k) => s.tireTempAvg[k] >= 235);
  if (hot.length > 0) {
    const frontHot = hot.some((k) => k.startsWith("f"));
    const pKey = frontHot ? "frontPressure" : "rearPressure";
    const value =
      tune[pKey] != null
        ? `${frontHot ? "Front" : "Rear"} pressure ${r1(tune[pKey]!)} → try ~${r1(tune[pKey]! - 1)} psi`
        : undefined;
    out.push({
      id: "tire-hot",
      area: "Tires (temperature)",
      confidence: "low",
      value,
      message: `Running hot at ${hot.map((k) => k.toUpperCase()).join(", ")} — those tires are working hardest. Hint only: the feed can't read pressure, so treat this as a nudge, not a fact.`,
      detail: hot.map((k) => `${k.toUpperCase()} avg ${r0(s.tireTempAvg[k])}°F`).join(", "),
    });
  }

  return out;
}

export const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

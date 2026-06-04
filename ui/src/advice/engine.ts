import type { Telemetry, TireCorner } from "../types";

export type Confidence = "high" | "medium" | "low";

export interface Advice {
  id: string;
  area: string;
  confidence: Confidence;
  message: string;
  detail?: string;
}

// Tunables (kept here so they're easy to revise as we learn the game's feel).
const T = {
  minFrames: 30, // need ~0.5s of data before saying anything
  fullThrottle: 0.85,
  revLimiterFrac: 0.985, // rpm/maxRpm counted as "on the limiter"
  revLimiterTrigger: 0.12, // fraction of full-throttle frames on limiter to flag
  bottomOut: 0.97, // normalized suspension travel counted as bottoming
  bottomTrigger: 0.06,
  topOut: 0.03, // normalized travel counted as fully extended (wheel unloading)
  topTrigger: 0.1,
  cornerSteer: 0.25,
  cornerSpeed: 12, // m/s (~43 km/h)
  brakeOn: 0.55,
  brakeSpeed: 8,
  powerOn: 0.6,
  powerSpeed: 4,
  wheelspinSlip: 0.18, // slip ratio magnitude = spinning
  lockSlip: 0.18, // slip ratio magnitude (negative) = locking
  slipEventTrigger: 0.1, // fraction of relevant frames showing the slip event
  balanceRatio: 1.5, // front/rear slip-angle ratio to call under/oversteer
  hotTire: 235, // deg F
  coldTire: 150,
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const frac = (n: number, d: number) => (d > 0 ? n / d : 0);

function drivenCorners(drivetrain: number): ("fl" | "fr" | "rl" | "rr")[] {
  if (drivetrain === 0) return ["fl", "fr"]; // FWD
  if (drivetrain === 1) return ["rl", "rr"]; // RWD
  return ["fl", "fr", "rl", "rr"]; // AWD
}

/**
 * Analyze a rolling buffer of driving frames and produce directional tuning cues.
 * Returns [] when there isn't enough data to say anything responsibly.
 */
export function analyze(frames: Telemetry[]): Advice[] {
  if (frames.length < T.minFrames) return [];
  const out: Advice[] = [];
  const last = frames[frames.length - 1];
  const drivetrain = last.car.drivetrain;
  const driven = drivenCorners(drivetrain);
  const axleLabel = drivetrain === 0 ? "front" : drivetrain === 1 ? "rear" : "all";

  const tiresOf = (f: Telemetry, keys: ("fl" | "fr" | "rl" | "rr")[]): TireCorner[] =>
    keys.map((k) => f.tires[k]);

  // ---- Gearing: bouncing off the rev limiter (HIGH) ------------------------
  const wot = frames.filter((f) => f.throttle >= T.fullThrottle && f.gear > 0 && f.speed > 5);
  const onLimiter = wot.filter((f) => f.rpm.max > 0 && f.rpm.cur >= T.revLimiterFrac * f.rpm.max);
  if (wot.length > 10 && frac(onLimiter.length, wot.length) >= T.revLimiterTrigger) {
    const gear = onLimiter[onLimiter.length - 1].gear;
    out.push({
      id: "gearing-rev-limiter",
      area: "Gearing",
      confidence: "high",
      message: `You're hitting the rev limiter at full throttle (often in ${gear === 0 ? "a gear" : `gear ${gear}`}). Lengthen that gear, or raise the final drive, so you reach peak power before redline.`,
      detail: `${Math.round(frac(onLimiter.length, wot.length) * 100)}% of full-throttle time spent on the limiter.`,
    });
  }

  // ---- Springs / ride height: bottoming out (HIGH) -------------------------
  for (const k of ["fl", "fr", "rl", "rr"] as const) {
    const hits = frames.filter((f) => f.tires[k].suspNorm >= T.bottomOut).length;
    if (frac(hits, frames.length) >= T.bottomTrigger) {
      const end = k.startsWith("f") ? "front" : "rear";
      out.push({
        id: `bottoming-${end}`,
        area: "Springs / Ride height",
        confidence: "high",
        message: `Suspension is bottoming out at the ${end} (${k.toUpperCase()}). Raise ride height or stiffen the ${end} springs so it stops slamming into the bump stops.`,
        detail: `${Math.round(frac(hits, frames.length) * 100)}% of the time fully compressed.`,
      });
      break; // one bottoming-out message is enough
    }
  }

  // ---- Differential: wheelspin under power (HIGH) --------------------------
  const power = frames.filter((f) => f.throttle >= T.powerOn && f.speed > T.powerSpeed);
  if (power.length > 10) {
    const spin = power.filter(
      (f) => mean(tiresOf(f, driven).map((t) => Math.abs(t.slipRatio))) >= T.wheelspinSlip,
    );
    if (frac(spin.length, power.length) >= T.slipEventTrigger) {
      out.push({
        id: "diff-wheelspin",
        area: "Differential / Power",
        confidence: "high",
        message:
          drivetrain === 1
            ? "The rear axle is spinning up under power. Lower the differential acceleration % for more drive traction (or you're simply past the tires' grip — short-shift / ease throttle)."
            : drivetrain === 0
              ? "The front axle is spinning under power (torque steer / scrabble). Lower the diff acceleration % and be smoother with throttle on corner exit."
              : "Wheels are spinning under power. Lower the diff acceleration % (and consider rebalancing torque rearward) for cleaner drive.",
        detail: `Wheelspin on the ${axleLabel} axle in ${Math.round(frac(spin.length, power.length) * 100)}% of on-power frames.`,
      });
    }
  }

  // ---- Brakes: lockup + balance (HIGH) -------------------------------------
  const braking = frames.filter((f) => f.brake >= T.brakeOn && f.speed > T.brakeSpeed);
  if (braking.length > 8) {
    const frontLock = braking.filter(
      (f) => mean([f.tires.fl, f.tires.fr].map((t) => -t.slipRatio)) >= T.lockSlip,
    ).length;
    const rearLock = braking.filter(
      (f) => mean([f.tires.rl, f.tires.rr].map((t) => -t.slipRatio)) >= T.lockSlip,
    ).length;
    if (frac(frontLock, braking.length) >= T.slipEventTrigger && frontLock >= rearLock) {
      out.push({
        id: "brake-front-lock",
        area: "Brakes",
        confidence: "high",
        message:
          "Front wheels are locking under braking. Shift brake balance rearward or lower brake pressure so the fronts keep rolling and steering.",
        detail: `Front lockup in ${Math.round(frac(frontLock, braking.length) * 100)}% of braking frames.`,
      });
    } else if (frac(rearLock, braking.length) >= T.slipEventTrigger && rearLock > frontLock) {
      out.push({
        id: "brake-rear-lock",
        area: "Brakes",
        confidence: "high",
        message:
          "Rear wheels are locking under braking (can snap the back loose). Shift brake balance forward or lower brake pressure.",
        detail: `Rear lockup in ${Math.round(frac(rearLock, braking.length) * 100)}% of braking frames.`,
      });
    }
  }

  // ---- Balance: under / oversteer from slip angles (MEDIUM) ----------------
  const cornering = frames.filter(
    (f) => Math.abs(f.steer) >= T.cornerSteer && f.speed > T.cornerSpeed,
  );
  if (cornering.length > 12) {
    const frontSA = mean(
      cornering.map((f) => mean([f.tires.fl, f.tires.fr].map((t) => Math.abs(t.slipAngle)))),
    );
    const rearSA = mean(
      cornering.map((f) => mean([f.tires.rl, f.tires.rr].map((t) => Math.abs(t.slipAngle)))),
    );
    if (rearSA > 0.001 && frontSA / rearSA >= T.balanceRatio) {
      out.push({
        id: "balance-understeer",
        area: "Handling balance",
        confidence: "medium",
        message:
          "Car understeers (pushes) through corners — front tires slipping more than rears. Soften the front anti-roll bar (or stiffen the rear), or soften front springs.",
        detail: `Front slip angle ~${(frontSA / Math.max(rearSA, 0.001)).toFixed(1)}× the rear.`,
      });
    } else if (frontSA > 0.001 && rearSA / frontSA >= T.balanceRatio) {
      out.push({
        id: "balance-oversteer",
        area: "Handling balance",
        confidence: "medium",
        message:
          "Car oversteers (loose) through corners — rear tires slipping more than fronts. Stiffen the front anti-roll bar (or soften the rear), and ease diff acceleration.",
        detail: `Rear slip angle ~${(rearSA / Math.max(frontSA, 0.001)).toFixed(1)}× the front.`,
      });
    }
  }

  // ---- Wheel unloading / too stiff (MEDIUM) --------------------------------
  for (const end of [["fl", "fr", "front"], ["rl", "rr", "rear"]] as const) {
    const [a, b, label] = end;
    const hits = frames.filter(
      (f) => f.tires[a].suspNorm <= T.topOut || f.tires[b].suspNorm <= T.topOut,
    ).length;
    if (frac(hits, frames.length) >= T.topTrigger) {
      out.push({
        id: `unload-${label}`,
        area: "Springs / Ride height",
        confidence: "medium",
        message: `The ${label} suspension keeps topping out (wheels unloading). The ${label} may be too stiff or the ride height too low — try softening ${label} springs.`,
        detail: `${Math.round(frac(hits, frames.length) * 100)}% of the time fully extended.`,
      });
      break;
    }
  }

  // ---- Tire temperature window (LOW — proxy, no pressure data) --------------
  const hotKeys = (["fl", "fr", "rl", "rr"] as const).filter(
    (k) => mean(frames.map((f) => f.tires[k].temp)) >= T.hotTire,
  );
  if (hotKeys.length > 0) {
    out.push({
      id: "tire-hot",
      area: "Tires (temperature)",
      confidence: "low",
      message: `Running hot at ${hotKeys.map((k) => k.toUpperCase()).join(", ")}. Those tires are working hardest — easing load there (softer that end, or driving style) helps. Note: the feed can't see pressure directly, so treat this as a hint.`,
      detail: `Avg ${hotKeys.map((k) => `${k.toUpperCase()} ${Math.round(mean(frames.map((f) => f.tires[k].temp)))}°F`).join(", ")}.`,
    });
  }

  return out;
}

export const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

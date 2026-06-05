import type { CornerKey, Telemetry } from "../types";
import { speed as speedU, tempC, type Units } from "../units";
import type { BuildIdentity } from "../garage/model";
import { CarIdentity } from "./CarIdentity";

function tempColor(f: number): string {
  const c = Math.max(120, Math.min(260, f));
  const t = (c - 120) / 140;
  return `hsl(${210 - t * 210}, 75%, 50%)`;
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
function gearLabel(g: number): string {
  if (g === 0) return "R";
  if (g === 11) return "N";
  return String(g);
}

// The car IS the dashboard. Top-down silhouette pointing right: wide flat
// rear with a wing bar (which doubles as the brake light), parallel flanks,
// a short rounded corner into a flat front bumper, windshield marking the
// front of the cabin. Gear lives in the cabin, speed on the hood, RPM sweeps
// along both flanks (rear -> nose, red at the limiter), the friction circle
// sits on the rear deck and headlights come on while driving. Balance shows
// as a glow under the axle that's sliding: sky front = push, red rear = loose.

// Proportions matter: a real top-down car is ~2.4:1, longer reads as a boat.
const FLANK_TOP = "M 40 66 L 40 27 Q 40 16 54 16 L 246 16 Q 276 16 276 33 L 276 66";
const FLANK_BOT = "M 40 66 L 40 105 Q 40 116 54 116 L 246 116 Q 276 116 276 99 L 276 66";
const BODY =
  "M 40 66 L 40 27 Q 40 16 54 16 L 246 16 Q 276 16 276 33 L 276 66 L 276 99 Q 276 116 246 116 L 54 116 Q 40 116 40 105 L 40 66 Z";

const REAR_X = 80;
const FRONT_X = 216;
const WHEELS: { key: CornerKey; cx: number; cy: number }[] = [
  { key: "rl", cx: REAR_X, cy: 32 },
  { key: "rr", cx: REAR_X, cy: 100 },
  { key: "fl", cx: FRONT_X, cy: 32 },
  { key: "fr", cx: FRONT_X, cy: 100 },
];

export function CarStrip({
  t,
  units,
  driving,
  ordinal,
  build,
}: {
  t: Telemetry;
  units: Units;
  driving: boolean;
  /** The car being driven (last detected) — what this strip identifies. */
  ordinal: number | null;
  build?: BuildIdentity | null;
}) {
  const rpmPct = t.rpm.max > 0 ? Math.min(1, t.rpm.cur / t.rpm.max) : 0;
  const nearRedline = rpmPct >= 0.95;
  const sp = speedU(t.speed, units);
  const dt = t.car.drivetrain;
  const frontDriven = dt === 0 || dt === 2;
  const rearDriven = dt === 1 || dt === 2;

  const fSA = (Math.abs(t.tires.fl.slipAngle) + Math.abs(t.tires.fr.slipAngle)) / 2;
  const rSA = (Math.abs(t.tires.rl.slipAngle) + Math.abs(t.tires.rr.slipAngle)) / 2;
  const push = fSA > rSA * 1.3 && fSA > 0.02;
  const loose = rSA > fSA * 1.3 && rSA > 0.02;

  const longG = clamp(t.accel.z / 9.81, -1.5, 1.5);
  const latG = clamp(t.accel.x / 9.81, -1.5, 1.5);
  const gx = 98 + (longG / 1.5) * 14;
  const gy = 66 + (latG / 1.5) * 14;
  const gMag = Math.hypot(t.accel.x, t.accel.z) / 9.81;

  return (
    <div className="carstrip">
      {ordinal != null && (
        <div className="carstrip-id">
          <CarIdentity ordinal={ordinal} build={build} />
        </div>
      )}
      <svg className="car-svg-h" viewBox="0 0 300 132" preserveAspectRatio="xMidYMid meet">
        {/* rear wing bar — doubles as the brake light */}
        <rect x="27" y="14" width="10" height="104" rx="5" className="wing" />
        <rect
          x="27" y="14" width="10" height="104" rx="5"
          className="brakelight"
          opacity={driving ? clamp(t.brake, 0, 1) * 0.9 : 0}
        />

        {/* body + balance glows (under everything else) */}
        <path d={BODY} className="car-body" />
        <ellipse cx={FRONT_X} cy="66" rx="42" ry="40" className={`bal-glow front ${push ? "on" : ""}`} />
        <ellipse cx={REAR_X} cy="66" rx="40" ry="40" className={`bal-glow rear ${loose ? "on" : ""}`} />

        {/* RPM sweeps forward along both flanks, hits the nose at redline */}
        <path d={FLANK_TOP} pathLength={100} className={`rpm-sweep ${nearRedline ? "red" : ""}`}
          strokeDasharray={`${rpmPct * 100} 100`} />
        <path d={FLANK_BOT} pathLength={100} className={`rpm-sweep ${nearRedline ? "red" : ""}`}
          strokeDasharray={`${rpmPct * 100} 100`} />

        {/* drivetrain: driven axles, plus the center shaft for AWD */}
        {rearDriven && <line x1={REAR_X} y1="32" x2={REAR_X} y2="100" className="axle" />}
        {frontDriven && <line x1={FRONT_X} y1="32" x2={FRONT_X} y2="100" className="axle" />}
        {frontDriven && rearDriven && <line x1={REAR_X} y1="66" x2={FRONT_X} y2="66" className="drive-shaft" />}

        {/* cabin with windshield (front) + rear window */}
        <rect x="118" y="30" width="68" height="72" rx="16" className="car-cabin" />
        <path d="M 186 35 Q 204 66 186 97" className="glassline" />
        <path d="M 118 38 Q 108 66 118 94" className="glassline" />

        {/* gear in the cabin */}
        <text x="152" y="81" textAnchor="middle" className={`svg-gear ${nearRedline ? "red" : ""}`}>
          {gearLabel(t.gear)}
        </text>

        {/* speed in the nose */}
        <text x="254" y="63" textAnchor="middle" className="svg-speed">
          {Math.round(sp.v)}
        </text>
        <text x="254" y="77" textAnchor="middle" className="svg-unit">
          {sp.unit}
        </text>

        {/* friction circle on the rear deck, g readout inside */}
        <circle cx="98" cy="66" r="19" className="traction-ring" />
        <line x1="79" y1="66" x2="117" y2="66" className="traction-cross" />
        <line x1="98" y1="47" x2="98" y2="85" className="traction-cross" />
        <circle cx={gx} cy={gy} r="4.5" className="g-ball" />
        <text x="98" y="58" textAnchor="middle" className="svg-gmag">
          {gMag.toFixed(2)}g
        </text>

        {/* headlights at the front corners while driving */}
        <circle cx="264" cy="38" r="3.2" className={`headlight ${driving ? "on" : ""}`} />
        <circle cx="264" cy="94" r="3.2" className={`headlight ${driving ? "on" : ""}`} />

        {/* wheels: temp color + readout inside, susp gauge, slip ring, slip-angle rotation */}
        {WHEELS.map((w) => {
          const c = t.tires[w.key];
          const rot = clamp(c.slipAngle * 45, -35, 35);
          const spinning = c.slipRatio > 0.05;
          const locking = c.slipRatio < -0.05;
          const ringW = clamp(Math.abs(c.slipRatio) * 5, 0, 5);
          return (
            <g key={w.key} transform={`rotate(${rot} ${w.cx} ${w.cy})`}>
              {(spinning || locking) && (
                <rect
                  x={w.cx - 23}
                  y={w.cy - 11}
                  width="46"
                  height="22"
                  rx="8"
                  fill="none"
                  style={{ stroke: spinning ? "var(--red)" : "var(--secondary)" }}
                  strokeWidth={ringW}
                  opacity="0.9"
                />
              )}
              <rect x={w.cx - 20} y={w.cy - 8} width="40" height="16" rx="6.5" fill={tempColor(c.temp)} />
              <rect
                x={w.cx - 17}
                y={w.cy - 5}
                width={Math.max(2, c.suspNorm * 34)}
                height="10"
                rx="3.5"
                className="susp-fill"
              />
              <text x={w.cx} y={w.cy + 4} textAnchor="middle" className="wheel-temp">
                {Math.round(tempC(c.temp, units).v)}°
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

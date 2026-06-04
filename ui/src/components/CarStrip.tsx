import type { CornerKey, Telemetry } from "../types";
import { speed as speedU, type Units } from "../units";

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

// Landscape layout: car points right. Front wheels on the right.
const WHEELS: { key: CornerKey; cx: number; cy: number }[] = [
  { key: "rl", cx: 86, cy: 46 },
  { key: "rr", cx: 86, cy: 104 },
  { key: "fl", cx: 232, cy: 46 },
  { key: "fr", cx: 232, cy: 104 },
];
function drivenSet(dt: number): Set<CornerKey> {
  if (dt === 0) return new Set<CornerKey>(["fl", "fr"]);
  if (dt === 1) return new Set<CornerKey>(["rl", "rr"]);
  return new Set<CornerKey>(["fl", "fr", "rl", "rr"]);
}

export function CarStrip({ t, units, driving }: { t: Telemetry; units: Units; driving: boolean }) {
  const rpmPct = t.rpm.max > 0 ? Math.min(1, t.rpm.cur / t.rpm.max) : 0;
  const sp = speedU(t.speed, units);
  const driven = drivenSet(t.car.drivetrain);

  const fSA = (Math.abs(t.tires.fl.slipAngle) + Math.abs(t.tires.fr.slipAngle)) / 2;
  const rSA = (Math.abs(t.tires.rl.slipAngle) + Math.abs(t.tires.rr.slipAngle)) / 2;
  let bal = "NEUTRAL";
  let cls = "bal-neutral";
  if (fSA > rSA * 1.3 && fSA > 0.02) {
    bal = "PUSH";
    cls = "bal-under";
  } else if (rSA > fSA * 1.3 && rSA > 0.02) {
    bal = "LOOSE";
    cls = "bal-over";
  }

  const longG = clamp(t.accel.z / 9.81, -1.5, 1.5);
  const latG = clamp(t.accel.x / 9.81, -1.5, 1.5);
  const gx = 159 + (longG / 1.5) * 26;
  const gy = 75 + (latG / 1.5) * 26;
  const gMag = Math.hypot(t.accel.x, t.accel.z) / 9.81;

  return (
    <div className="carstrip">
      <div className="cs-readouts">
        <div className="cs-top">
          <span className={`lm-dot ${driving ? "on" : ""}`} />
          <span className="cs-gear">{gearLabel(t.gear)}</span>
        </div>
        <div className="cs-speed">
          {Math.round(sp.v)}
          <span className="lm-unit">{sp.unit}</span>
        </div>
        <div className="lm-rpm">
          <div className={`lm-rpm-fill ${rpmPct >= 0.95 ? "red" : ""}`} style={{ width: `${rpmPct * 100}%` }} />
        </div>
        <span className={`bal-pill ${cls}`}>{bal}</span>
      </div>

      <svg className="car-svg-h" viewBox="0 0 318 150" preserveAspectRatio="xMidYMid meet">
        <rect x="40" y="22" width="238" height="106" rx="40" className="car-body" />
        <rect x="120" y="44" width="80" height="62" rx="14" className="car-cabin" />
        {(driven.has("fl") || driven.has("rl")) && (
          <line x1="86" y1="75" x2="232" y2="75" className="drive-shaft" />
        )}
        <circle cx="159" cy="75" r="27" className="traction-ring" />
        <line x1="132" y1="75" x2="186" y2="75" className="traction-cross" />
        <line x1="159" y1="48" x2="159" y2="102" className="traction-cross" />
        <circle cx={gx} cy={gy} r="5" className="g-ball" />
        <text x="159" y="120" className="g-text" textAnchor="middle">
          {gMag.toFixed(2)}g
        </text>
        {WHEELS.map((w) => {
          const c = t.tires[w.key];
          const rot = clamp(c.slipAngle * 45, -35, 35);
          const spinning = c.slipRatio > 0.05;
          const locking = c.slipRatio < -0.05;
          const ringW = clamp(Math.abs(c.slipRatio) * 5, 0, 6);
          return (
            <g key={w.key} transform={`rotate(${rot} ${w.cx} ${w.cy})`}>
              {(spinning || locking) && (
                <rect
                  x={w.cx - 12}
                  y={w.cy - 25}
                  width="24"
                  height="50"
                  rx="8"
                  fill="none"
                  style={{ stroke: spinning ? "var(--red)" : "var(--secondary)" }}
                  strokeWidth={ringW}
                  opacity="0.9"
                />
              )}
              <rect x={w.cx - 9} y={w.cy - 21} width="18" height="42" rx="6" fill={tempColor(c.temp)} />
              <rect
                x={w.cx - 4}
                y={w.cy - 19 + (1 - c.suspNorm) * 38}
                width="8"
                height={Math.max(2, c.suspNorm * 38)}
                rx="3"
                className="susp-fill"
              />
              {driven.has(w.key) && <circle cx={w.cx} cy={w.cy} r="2.5" className="driven-dot" />}
              <text x={w.cx} y={w.cy + 35} className="wheel-temp" textAnchor="middle">
                {Math.round(c.temp)}°
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

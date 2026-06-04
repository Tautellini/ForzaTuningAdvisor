import type { CornerKey, Telemetry } from "../types";
import { DRIVETRAIN } from "../types";

function tempColor(f: number): string {
  const c = Math.max(120, Math.min(260, f));
  const t = (c - 120) / 140;
  return `hsl(${210 - t * 210}, 75%, 50%)`;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const WHEELS: { key: CornerKey; cx: number; cy: number }[] = [
  { key: "fl", cx: 58, cy: 92 },
  { key: "fr", cx: 162, cy: 92 },
  { key: "rl", cx: 58, cy: 268 },
  { key: "rr", cx: 162, cy: 268 },
];

function drivenSet(dt: number): Set<CornerKey> {
  if (dt === 0) return new Set<CornerKey>(["fl", "fr"]);
  if (dt === 1) return new Set<CornerKey>(["rl", "rr"]);
  return new Set<CornerKey>(["fl", "fr", "rl", "rr"]);
}

export function CarView({ t }: { t: Telemetry }) {
  const driven = drivenSet(t.car.drivetrain);

  const fSA = (Math.abs(t.tires.fl.slipAngle) + Math.abs(t.tires.fr.slipAngle)) / 2;
  const rSA = (Math.abs(t.tires.rl.slipAngle) + Math.abs(t.tires.rr.slipAngle)) / 2;
  let balLabel = "NEUTRAL";
  let balCls = "bal-neutral";
  if (fSA > rSA * 1.3 && fSA > 0.02) {
    balLabel = "UNDERSTEER";
    balCls = "bal-under";
  } else if (rSA > fSA * 1.3 && rSA > 0.02) {
    balLabel = "OVERSTEER";
    balCls = "bal-over";
  }

  const latG = clamp(t.accel.x / 9.81, -1.5, 1.5);
  const longG = clamp(t.accel.z / 9.81, -1.5, 1.5);
  const gx = 110 + (latG / 1.5) * 36;
  const gy = 180 - (longG / 1.5) * 36;
  const gMag = Math.hypot(t.accel.x, t.accel.z) / 9.81;

  return (
    <div className="viz-card carview">
      <div className="viz-head">
        <h3>Car — live</h3>
        <span className={`bal-pill ${balCls}`}>{balLabel}</span>
      </div>

      <svg className="car-svg" viewBox="0 0 220 360">
        {/* body */}
        <rect x="38" y="44" width="144" height="272" rx="42" className="car-body" />
        <rect x="64" y="120" width="92" height="120" rx="16" className="car-cabin" />

        {/* driven-axle bar */}
        {(driven.has("fl") || driven.has("rl")) && (
          <line
            x1="110"
            y1={driven.has("fl") ? 92 : 268}
            x2="110"
            y2={driven.has("rl") && driven.has("fl") ? 268 : driven.has("rl") ? 268 : 92}
            className="drive-shaft"
          />
        )}

        {/* traction circle + g ball */}
        <circle cx="110" cy="180" r="36" className="traction-ring" />
        <line x1="74" y1="180" x2="146" y2="180" className="traction-cross" />
        <line x1="110" y1="144" x2="110" y2="216" className="traction-cross" />
        <circle cx={gx} cy={gy} r="6" className="g-ball" />
        <text x="110" y="232" className="g-text" textAnchor="middle">
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
              {/* slip ring */}
              {(spinning || locking) && (
                <rect
                  x={w.cx - 17}
                  y={w.cy - 29}
                  width="34"
                  height="58"
                  rx="9"
                  fill="none"
                  stroke={spinning ? "#ff4d4d" : "#4da3ff"}
                  strokeWidth={ringW}
                  opacity="0.9"
                />
              )}
              {/* tire, colored by temp */}
              <rect
                x={w.cx - 13}
                y={w.cy - 25}
                width="26"
                height="50"
                rx="7"
                fill={tempColor(c.temp)}
              />
              {/* suspension compression fill */}
              <rect
                x={w.cx - 5}
                y={w.cy - 22 + (1 - c.suspNorm) * 44}
                width="10"
                height={Math.max(2, c.suspNorm * 44)}
                rx="3"
                className="susp-fill"
              />
              {driven.has(w.key) && <circle cx={w.cx} cy={w.cy} r="3" className="driven-dot" />}
              <text x={w.cx} y={w.cy + 42} className="wheel-temp" textAnchor="middle">
                {Math.round(c.temp)}°
              </text>
            </g>
          );
        })}
      </svg>

      <div className="car-foot">
        <span>{DRIVETRAIN[t.car.drivetrain] ?? "?"}</span>
        <span className="legend-spin">● spin</span>
        <span className="legend-lock">● lock</span>
        <span className="muted">ring = slip · color = temp</span>
      </div>
    </div>
  );
}

import type { CornerKey, Telemetry } from "../types";
import { DRIVETRAIN } from "../types";
import { power as powerU, pressure, speed as speedU, tempC, type Units } from "../units";

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

export function LivePanel({ t, units }: { t: Telemetry; units: Units }) {
  const rpmPct = t.rpm.max > 0 ? Math.min(1, t.rpm.cur / t.rpm.max) : 0;
  const nearLimit = rpmPct >= 0.95;
  const driven = drivenSet(t.car.drivetrain);
  const sp = speedU(t.speed, units);
  const pw = powerU(t.power, units);
  const bo = pressure(t.boost, units);

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
    <section className="livepanel">
      {/* left: speed / gear / rpm / inputs */}
      <div className="live-readouts">
        <div className="live-speedgear">
          <div className="gear">{gearLabel(t.gear)}</div>
          <div className="speed">
            {Math.round(sp.v)}
            <span className="unit"> {sp.unit}</span>
          </div>
        </div>
        <div className={`rpm-bar ${nearLimit ? "redline" : ""}`}>
          <div className="rpm-fill" style={{ width: `${rpmPct * 100}%` }} />
        </div>
        <div className="rpm-val">
          {Math.round(t.rpm.cur).toLocaleString()}
          <span className="unit"> / {Math.round(t.rpm.max).toLocaleString()} rpm</span>
        </div>
        <div className="pedals">
          <Pedal label="Throttle" v={t.throttle} cls="bar-green" />
          <Pedal label="Brake" v={t.brake} cls="bar-red" />
          <Steer v={t.steer} />
        </div>
      </div>

      {/* center: live car diagram */}
      <div className="live-car">
        <span className={`bal-pill ${balCls}`}>{balLabel}</span>
        <svg className="car-svg" viewBox="0 0 220 360">
          <rect x="38" y="44" width="144" height="272" rx="42" className="car-body" />
          <rect x="64" y="120" width="92" height="120" rx="16" className="car-cabin" />
          {(driven.has("fl") || driven.has("rl")) && (
            <line
              x1="110"
              y1={driven.has("fl") ? 92 : 268}
              x2="110"
              y2="268"
              className="drive-shaft"
            />
          )}
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
                <rect x={w.cx - 13} y={w.cy - 25} width="26" height="50" rx="7" fill={tempColor(c.temp)} />
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
                  {Math.round(tempC(c.temp, units).v)}°
                </text>
              </g>
            );
          })}
        </svg>
        <div className="car-foot">
          <span className="legend-spin">● spin</span>
          <span className="legend-lock">● lock</span>
          <span className="muted">ring = slip · color = temp</span>
        </div>
      </div>

      {/* right: stats */}
      <div className="live-stats">
        <Stat label="Car" value={`${t.car.pi} PI`} sub={DRIVETRAIN[t.car.drivetrain] ?? "?"} />
        <Stat label="Power" value={`${Math.round(pw.v)}`} sub={pw.unit} />
        <Stat label="Boost" value={`${bo.v.toFixed(units.system === "imperial" ? 1 : 2)}`} sub={bo.unit} />
        <Stat label="Fuel" value={`${Math.round(t.fuel * 100)}`} sub="%" />
        <Stat label="Lateral" value={`${(t.accel.x / 9.81).toFixed(2)}`} sub="g" />
      </div>
    </section>
  );
}

function Pedal({ label, v, cls }: { label: string; v: number; cls: string }) {
  return (
    <div className="pedal">
      <div className="pedal-label">{label}</div>
      <div className="pedal-track">
        <div className={`pedal-fill ${cls}`} style={{ height: `${Math.round(v * 100)}%` }} />
      </div>
    </div>
  );
}

function Steer({ v }: { v: number }) {
  return (
    <div className="pedal steer">
      <div className="pedal-label">Steer</div>
      <div className="steer-track">
        <div className="steer-center" />
        <div className="steer-dot" style={{ left: `calc(${50 + v * 50}% - 6px)` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        <span className="stat-sub"> {sub}</span>
      </div>
    </div>
  );
}

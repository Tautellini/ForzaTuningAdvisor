import type { Telemetry } from "../types";
import { DRIVETRAIN } from "../types";
import { TireGrid } from "./TireGrid";

const mps2kmh = (v: number) => Math.round(v * 3.6);

function gearLabel(g: number): string {
  if (g === 0) return "R";
  if (g === 11) return "N";
  return String(g);
}

export function Dashboard({ t }: { t: Telemetry }) {
  const rpmPct = t.rpm.max > 0 ? Math.min(1, t.rpm.cur / t.rpm.max) : 0;
  const nearLimit = rpmPct >= 0.95;

  return (
    <section className="dash">
      <div className="dash-primary">
        <div className="rpm">
          <div className={`rpm-bar ${nearLimit ? "redline" : ""}`}>
            <div className="rpm-fill" style={{ width: `${rpmPct * 100}%` }} />
          </div>
          <div className="rpm-val">
            {Math.round(t.rpm.cur).toLocaleString()}
            <span className="unit"> / {Math.round(t.rpm.max).toLocaleString()} rpm</span>
          </div>
        </div>
        <div className="speed-gear">
          <div className="gear">{gearLabel(t.gear)}</div>
          <div className="speed">
            {mps2kmh(t.speed)}
            <span className="unit"> km/h</span>
          </div>
        </div>
      </div>

      <div className="pedals">
        <Pedal label="Throttle" v={t.throttle} cls="bar-green" />
        <Pedal label="Brake" v={t.brake} cls="bar-red" />
        <Steer v={t.steer} />
      </div>

      <div className="stats">
        <Stat label="Car" value={`${t.car.pi} PI · ${DRIVETRAIN[t.car.drivetrain] ?? "?"}`} />
        <Stat label="Power" value={`${Math.round(t.power / 1000)} kW`} />
        <Stat label="Boost" value={`${t.boost.toFixed(1)} psi`} />
        <Stat label="Fuel" value={`${Math.round(t.fuel * 100)}%`} />
        <Stat label="Lat. accel" value={`${(t.accel.x / 9.81).toFixed(2)} g`} />
      </div>

      <TireGrid tires={t.tires} />
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
        <div
          className="steer-dot"
          style={{ left: `calc(${50 + v * 50}% - 6px)` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

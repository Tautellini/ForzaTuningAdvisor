import type { Telemetry } from "../types";
import { speed as speedU, type Units } from "../units";

function gearLabel(g: number): string {
  if (g === 0) return "R";
  if (g === 11) return "N";
  return String(g);
}

/** Compact live readout — confirms data is flowing; lives in the sticky bar. */
export function LiveMini({ t, units, driving }: { t: Telemetry; units: Units; driving: boolean }) {
  const rpmPct = t.rpm.max > 0 ? Math.min(1, t.rpm.cur / t.rpm.max) : 0;
  const sp = speedU(t.speed, units);

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

  return (
    <div className="livemini">
      <span className={`lm-dot ${driving ? "on" : ""}`} title={driving ? "driving" : "idle"} />
      <div className="lm-gear">{gearLabel(t.gear)}</div>
      <div className="lm-speed">
        {Math.round(sp.v)}
        <span className="lm-unit">{sp.unit}</span>
      </div>
      <div className="lm-rpm">
        <div className={`lm-rpm-fill ${rpmPct >= 0.95 ? "red" : ""}`} style={{ width: `${rpmPct * 100}%` }} />
      </div>
      <div className="lm-pedals">
        <div className="lm-ped">
          <div className="lm-ped-fill g" style={{ height: `${t.throttle * 100}%` }} />
        </div>
        <div className="lm-ped">
          <div className="lm-ped-fill r" style={{ height: `${t.brake * 100}%` }} />
        </div>
      </div>
      <span className={`bal-pill ${cls}`}>{bal}</span>
    </div>
  );
}

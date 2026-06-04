import type { SessionSummary } from "../session";
import type { CurrentTune } from "../tune";

interface Props {
  summary: SessionSummary | null;
  tune: CurrentTune;
}

function AxleBar({ label, frac, kind, muted }: { label: string; frac: number; kind: string; muted?: boolean }) {
  return (
    <div className={`axlebar ${muted ? "is-muted" : ""}`}>
      <span className="axle-label">{label}</span>
      <div className="axle-track">
        <div className={`axle-fill ${kind}`} style={{ width: `${Math.round(frac * 100)}%` }} />
      </div>
      <span className="axle-val">{Math.round(frac * 100)}%</span>
    </div>
  );
}

export function TractionBrakes({ summary, tune }: Props) {
  if (!summary) {
    return (
      <div className="viz-card">
        <div className="viz-head">
          <h3>Traction &amp; brakes</h3>
        </div>
        <div className="viz-empty">No driving data yet.</div>
      </div>
    );
  }
  const dt = summary.car.drivetrain;
  const frontDriven = dt === 0 || dt === 2;
  const rearDriven = dt === 1 || dt === 2;

  return (
    <div className="viz-card">
      <div className="viz-head">
        <h3>Traction &amp; brakes</h3>
        <span className="viz-sub">per axle · this session</span>
      </div>

      <div className="tb-group">
        <div className="tb-title">Wheelspin under power</div>
        <AxleBar label="Front" frac={summary.frontSpinFrac} kind="spin" muted={!frontDriven} />
        <AxleBar label="Rear" frac={summary.rearSpinFrac} kind="spin" muted={!rearDriven} />
        <div className="tb-note muted">
          {dt === 2 ? "AWD — both axles drive" : frontDriven ? "FWD — front drives" : "RWD — rear drives"}
        </div>
      </div>

      <div className="tb-group">
        <div className="tb-title">Lockup under braking</div>
        <AxleBar label="Front" frac={summary.frontLockFrac} kind="lock" />
        <AxleBar label="Rear" frac={summary.rearLockFrac} kind="lock" />
        {tune.brakeBalance != null && (
          <div className="brake-balance">
            <div className="bb-track">
              <div className="bb-marker" style={{ left: `${tune.brakeBalance}%` }} />
            </div>
            <div className="bb-labels">
              <span>rear</span>
              <span>balance {Math.round(tune.brakeBalance)}% front</span>
              <span>front</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

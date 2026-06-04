import type { SessionSummary } from "../session";
import { DRIVETRAIN } from "../types";

interface Props {
  summary: SessionSummary | null;
  onReset: () => void;
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export function SessionBar({ summary, onReset }: Props) {
  return (
    <div className="sessionbar">
      <div className="session-info">
        <span className="session-title">Session</span>
        {summary ? (
          <span className="session-stats">
            {fmtDuration(summary.durationS)} · {summary.drivingFrames.toLocaleString()} samples ·
            top {Math.round(summary.maxSpeed)} km/h
          </span>
        ) : (
          <span className="session-stats muted">no driving data yet</span>
        )}
      </div>

      {summary && (
        <div className="car-info">
          <Chip label="PI" value={String(summary.car.pi)} />
          <Chip label="Class" value={String(summary.car.class)} />
          <Chip label="Drive" value={DRIVETRAIN[summary.car.drivetrain] ?? "?"} />
          <Chip label="Cyl" value={String(summary.car.cylinders)} />
          <Chip label="Ordinal" value={String(summary.car.ordinal)} />
        </div>
      )}

      <button className="reset-btn" onClick={onReset} title="Clear accumulated session data">
        Reset session
      </button>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="chip">
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
    </span>
  );
}

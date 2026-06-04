import type { SessionSummary } from "../session";

interface Props {
  summary: SessionSummary | null;
}

interface Row {
  label: string;
  have: number;
  need: number;
  unlocks: string;
  todo: string;
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export function Coverage({ summary }: Props) {
  if (!summary) {
    return (
      <div className="viz-card">
        <div className="viz-head">
          <h3>Data coverage</h3>
        </div>
        <div className="viz-empty">Drive to gather data for your current tune.</div>
      </div>
    );
  }

  const rows: Row[] = [
    {
      label: "Cornering",
      have: summary.corneringFrames,
      need: 40,
      unlocks: "balance",
      todo: "lean on it through more corners",
    },
    {
      label: "Braking zones",
      have: summary.brakingFrames,
      need: 20,
      unlocks: "brakes",
      todo: "do some hard braking",
    },
    {
      label: "Power pulls",
      have: summary.powerCurve.length,
      need: 4,
      unlocks: "gearing",
      todo: "full-throttle pulls through the gears",
    },
    {
      label: "On-power exits",
      have: summary.powerFrames,
      need: 30,
      unlocks: "differential",
      todo: "get on the power out of corners",
    },
    {
      label: "Fast corners",
      have: summary.highSpeedCornerFrames,
      need: 40,
      unlocks: "aero",
      todo: "take some corners above ~110 km/h",
    },
  ];

  return (
    <div className="viz-card">
      <div className="viz-head">
        <h3>Data coverage</h3>
        <span className="viz-sub">
          {summary.drivingFrames.toLocaleString()} samples · {fmtDur(summary.durationS)} across your
          sessions
        </span>
      </div>
      <ul className="cov-list">
        {rows.map((r) => {
          const ok = r.have >= r.need;
          const ratio = Math.min(1, r.have / r.need);
          return (
            <li key={r.label} className="cov-row">
              <span className={`cov-icon ${ok ? "ok" : ""}`}>{ok ? "✓" : "…"}</span>
              <span className="cov-label">{r.label}</span>
              <div className="cov-track">
                <div className={`cov-fill ${ok ? "ok" : ""}`} style={{ width: `${ratio * 100}%` }} />
              </div>
              <span className="cov-note">
                {ok ? `${r.unlocks} ready` : `for ${r.unlocks} — ${r.todo}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

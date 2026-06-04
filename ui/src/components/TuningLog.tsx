import type { RecordedSession } from "../sessions";

interface Props {
  sessions: RecordedSession[];
}

const W = 520;
const H = 90;
const PAD = 10;

function balanceY(ratio: number): number {
  const v = Math.max(-1, Math.min(1, Math.log2(Math.max(ratio, 0.01))));
  return PAD + (1 - (v + 1) / 2) * (H - 2 * PAD);
}

export function TuningLog({ sessions }: Props) {
  // chronological (oldest -> newest)
  const log = [...sessions].reverse();

  if (log.length < 2) {
    return (
      <div className="viz-card">
        <div className="viz-head">
          <h3>Balance &amp; grip trend</h3>
        </div>
        <div className="viz-empty">
          Record at least two sessions (drive, change the car, drive again) to see how your changes
          move the balance and grip.
        </div>
      </div>
    );
  }

  const n = log.length;
  const x = (i: number) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  const balPath = log
    .map((e, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${balanceY(e.m.understeerRatio).toFixed(1)}`)
    .join(" ");

  return (
    <div className="viz-card">
      <div className="viz-head">
        <h3>Balance &amp; grip trend</h3>
        <span className="viz-sub">across your recorded sessions →</span>
      </div>
      <div className="trend-legend">Balance (top = oversteer · middle = neutral · bottom = understeer)</div>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1={PAD} y1={balanceY(1)} x2={W - PAD} y2={balanceY(1)} className="trend-neutral" />
        <text x={W - PAD} y={balanceY(1) - 3} className="axis-label" textAnchor="end">
          neutral
        </text>
        {balPath && <path d={balPath} className="trend-line" />}
        {log.map((e, i) => (
          <circle
            key={e.id}
            cx={x(i)}
            cy={balanceY(e.m.understeerRatio)}
            r={i === n - 1 ? 5 : 3}
            className={
              e.m.understeerRatio >= 1.15
                ? "trend-dot under"
                : e.m.understeerRatio <= 0.87
                  ? "trend-dot over"
                  : "trend-dot ok"
            }
          />
        ))}
      </svg>
      <div className="trend-foot muted">
        Newest on the right (peak grip {Math.max(...log.map((e) => e.m.maxLatG)).toFixed(2)}g). Each
        dot is one session.
      </div>
    </div>
  );
}

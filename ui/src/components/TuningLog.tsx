import type { TuneSnapshot } from "../tuninglog";

interface Props {
  log: TuneSnapshot[];
  onClear: () => void;
}

const W = 520;
const H = 90;
const PAD = 10;

function balanceY(ratio: number): number {
  // log scale around 1.0; clamp to [0.5, 2]
  const v = Math.max(-1, Math.min(1, Math.log2(Math.max(ratio, 0.01))));
  return PAD + (1 - (v + 1) / 2) * (H - 2 * PAD);
}

export function TuningLog({ log, onClear }: Props) {
  if (log.length === 0) {
    return (
      <div className="viz-card">
        <div className="viz-head">
          <h3>Tuning log &amp; trend</h3>
        </div>
        <div className="viz-empty">
          Hit <b>Reset</b> after each tune change — it snapshots this run's balance &amp; grip so you
          can see whether the change helped, and chart the trend.
        </div>
      </div>
    );
  }

  const n = log.length;
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD));
  const balPath = log
    .map((e, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${balanceY(e.m.understeerRatio).toFixed(1)}`)
    .join(" ");

  const recent = [...log].slice(-6).reverse();
  const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const balText = (r: number) => (r >= 1.15 ? "understeer" : r <= 0.87 ? "oversteer" : "neutral");

  return (
    <div className="viz-card">
      <div className="viz-head">
        <h3>Tuning log &amp; trend</h3>
        <button className="link-btn" onClick={onClear}>
          clear
        </button>
      </div>

      <div className="trend-legend">Balance over your changes (top = oversteer, middle = neutral)</div>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1={PAD} y1={balanceY(1)} x2={W - PAD} y2={balanceY(1)} className="trend-neutral" />
        <text x={W - PAD} y={balanceY(1) - 3} className="axis-label" textAnchor="end">
          neutral
        </text>
        {balPath && <path d={balPath} className="trend-line" />}
        {log.map((e, i) => (
          <circle
            key={i}
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

      <ul className="trend-list">
        {recent.map((e, i) => (
          <li key={i} className="trend-row">
            <span className="tr-time">{fmtTime(e.t)}</span>
            <span className="tr-mode">{e.discipline}</span>
            <span className={`tr-bal ${balText(e.m.understeerRatio)}`}>
              {balText(e.m.understeerRatio)} {e.m.understeerRatio.toFixed(2)}
            </span>
            <span className="tr-grip">{e.m.maxLatG.toFixed(2)}g</span>
            <span className="tr-extra muted">
              {Math.round(e.m.frontSpinFrac * 100)}/{Math.round(e.m.rearSpinFrac * 100)}% spin F/R
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

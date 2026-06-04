import type { Advice, AdviceKind, AdviceViz, Confidence } from "../advice/engine";
import { CONFIDENCE_RANK } from "../advice/engine";

const BADGE: Record<Confidence, string> = {
  high: "badge-high",
  medium: "badge-med",
  low: "badge-low",
};
const BADGE_TEXT: Record<Confidence, string> = {
  high: "high confidence",
  medium: "medium",
  low: "low / hint",
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function Viz({ v }: { v: AdviceViz }) {
  if (v.kind === "balance") {
    const pos = clamp(0.5 + clamp(Math.log2(Math.max(v.ratio, 0.01)) / 2, -0.5, 0.5), 0, 1);
    return (
      <div className="viz-balance">
        <div className="vb-track">
          <span className="vb-center" />
          <span className="vb-marker" style={{ left: `${pos * 100}%` }} />
        </div>
        <div className="vb-labels">
          <span>oversteer</span>
          <span>neutral</span>
          <span>understeer</span>
        </div>
      </div>
    );
  }
  if (v.kind === "bar") {
    return (
      <div className="viz-bar">
        <div className="vbar-track">
          <div className={`vbar-fill tone-${v.tone}`} style={{ width: `${clamp(v.value, 0, 1) * 100}%` }} />
        </div>
        <span className="vbar-val">{Math.round(clamp(v.value, 0, 1) * 100)}%</span>
      </div>
    );
  }
  if (v.kind === "delta") {
    const span = v.max - v.min || 1;
    const toPos = clamp((v.to - v.min) / span, 0, 1);
    const fromPos = v.from != null ? clamp((v.from - v.min) / span, 0, 1) : null;
    return (
      <div className="viz-delta">
        <div className="vd-track">
          {fromPos != null && <span className="vd-from" style={{ left: `${fromPos * 100}%` }} />}
          <span className="vd-to" style={{ left: `${toPos * 100}%` }} />
        </div>
        <div className="vd-text">
          {v.from != null ? `${Math.round(v.from)} → ` : "target "}
          <b>{Math.round(v.to)}</b>
          {v.unit ? ` ${v.unit}` : ""}
        </div>
      </div>
    );
  }
  // dir
  return (
    <div className={`viz-dir dir-${v.dir}`}>
      <span className="vd-arrow">{v.dir === "more" ? "▲" : "▼"}</span>
      {v.dir === "more" ? "more" : "less"} {v.label}
    </div>
  );
}

function Card({ a }: { a: Advice }) {
  return (
    <li className="advice-item">
      <div className="advice-head">
        <span className="advice-area">{a.area}</span>
        <span className={`badge ${BADGE[a.confidence]}`}>{BADGE_TEXT[a.confidence]}</span>
      </div>
      <div className="advice-section">
        <span className="advice-tag">Recommendation</span>
        <p className="advice-rec">{a.recommendation}</p>
        {a.viz && <Viz v={a.viz} />}
      </div>
      {a.trend && <div className="advice-trend">{a.trend}</div>}
      <div className="advice-section">
        <span className="advice-tag">Why — your data</span>
        <p className="advice-body">{a.why}</p>
      </div>
      <div className="advice-section">
        <span className="advice-tag">Expected outcome</span>
        <p className="advice-body">{a.outcome}</p>
      </div>
    </li>
  );
}

export function AdvicePanel({ advice, enoughData }: { advice: Advice[]; enoughData: boolean }) {
  const sorted = [...advice].sort(
    (a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  );
  const groups: { kind: AdviceKind; title: string; sub: string; items: Advice[] }[] = [
    {
      kind: "fix",
      title: "Fixes",
      sub: "issues the data shows in how the car behaves",
      items: sorted.filter((a) => a.kind === "fix"),
    },
    {
      kind: "opportunity",
      title: "Opportunities",
      sub: "where you could go faster, biased to your priorities",
      items: sorted.filter((a) => a.kind === "opportunity"),
    },
  ];

  return (
    <section className="advice">
      <div className="advice-titlebar">
        <h2>Tuning advice</h2>
        <span className="advice-sub">
          live reading reacts as you drive; hit Reset after each tune change to log it
        </span>
      </div>

      {!enoughData ? (
        <div className="advice-empty">
          Keep driving — push through some corners, braking zones, and full-throttle pulls. Advice
          builds up as the session gathers data.
        </div>
      ) : sorted.length === 0 ? (
        <div className="advice-empty">
          Nothing to flag yet — the car looks reasonably balanced for how you've driven. Drive harder
          (or adjust your priorities) to surface opportunities.
        </div>
      ) : (
        groups.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.kind} className="advice-group">
                <h3 className="advice-group-title">
                  {g.title} <span className="advice-group-sub">{g.sub}</span>
                </h3>
                <ul className="advice-list">
                  {g.items.map((a) => (
                    <Card key={a.id} a={a} />
                  ))}
                </ul>
              </div>
            ),
        )
      )}

      <p className="advice-foot">
        Numbers come straight from your data (gearing, brake balance, aero). For springs, ARBs, ride
        height, pressures, enter your current tune to get target values. Camber/toe isn't shown — the
        feed reports only one temperature per tire.
      </p>
    </section>
  );
}

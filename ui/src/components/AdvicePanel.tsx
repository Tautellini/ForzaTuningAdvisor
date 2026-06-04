import type { Advice, AdviceKind, Confidence } from "../advice/engine";
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
      </div>
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
        <span className="advice-sub">accumulated over your whole session — drive more to sharpen it</span>
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
        Concrete numbers come straight from your data (gearing, brake balance, aero). For springs,
        ARBs, ride height, pressures, enter your current tune to get target values. Camber/toe isn't
        shown — the feed reports only one temperature per tire.
      </p>
    </section>
  );
}

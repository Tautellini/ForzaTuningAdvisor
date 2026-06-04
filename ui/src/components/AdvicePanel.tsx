import type { Advice, Confidence } from "../advice/engine";
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

export function AdvicePanel({ advice, enoughData }: { advice: Advice[]; enoughData: boolean }) {
  const sorted = [...advice].sort(
    (a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  );

  return (
    <aside className="advice">
      <h2>
        Tuning advice
        <span className="advice-sub">based on your whole session — drive more to sharpen it</span>
      </h2>

      {!enoughData ? (
        <div className="advice-empty">
          Keep driving — push through some corners, braking zones, and full-throttle pulls. Advice
          builds up as the session gathers data.
        </div>
      ) : sorted.length === 0 ? (
        <div className="advice-empty">
          Nothing obvious to flag yet — the car looks reasonably balanced for how you've driven so
          far. Drive harder to surface more.
        </div>
      ) : (
        <ul className="advice-list">
          {sorted.map((a) => (
            <li key={a.id} className="advice-item">
              <div className="advice-head">
                <span className="advice-area">{a.area}</span>
                <span className={`badge ${BADGE[a.confidence]}`}>{BADGE_TEXT[a.confidence]}</span>
              </div>
              {a.value && <div className="advice-value">{a.value}</div>}
              <p className="advice-msg">{a.message}</p>
              {a.detail && <p className="advice-detail">{a.detail}</p>}
            </li>
          ))}
        </ul>
      )}

      <p className="advice-foot">
        Concrete numbers come from your data (gearing, brake balance). For springs, ARBs, pressures
        etc. enter your current tune to get target values. Camber/toe isn't shown — the feed reports
        only one temperature per tire.
      </p>
    </aside>
  );
}

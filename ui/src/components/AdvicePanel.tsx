import { useState } from "react";
import type { Advice, AdviceGroup, AdviceViz, Confidence } from "../advice/engine";
import { CONFIDENCE_RANK } from "../advice/engine";
import { TUNE_GROUPS } from "../tune";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const CONF_TEXT: Record<Confidence, string> = {
  high: "high confidence",
  medium: "medium confidence",
  low: "low confidence — treat as a hint",
};

const GROUP_META: Record<string, { title: string; icon: string }> = {
  ...Object.fromEntries(TUNE_GROUPS.map((g) => [g.id, { title: g.title, icon: g.icon }])),
  general: { title: "General", icon: "✨" },
};
const GROUP_ORDER: AdviceGroup[] = [...TUNE_GROUPS.map((g) => g.id as AdviceGroup), "general"];

function Viz({ v }: { v: AdviceViz }) {
  if (v.kind === "delta") {
    const span = v.max - v.min || 1;
    const toPos = clamp((v.to - v.min) / span, 0, 1);
    const fromPos = v.from != null ? clamp((v.from - v.min) / span, 0, 1) : null;
    const dir = v.from != null ? (v.to > v.from ? "up" : v.to < v.from ? "down" : "flat") : "flat";
    return (
      <div className="chg chg-delta">
        <div className="chg-nums">
          {v.from != null && <span className="chg-from">{round(v.from)}</span>}
          <span className={`chg-arrow ${dir}`}>→</span>
          <span className="chg-to">
            {round(v.to)}
            {v.unit ? <span className="chg-unit"> {v.unit}</span> : null}
          </span>
        </div>
        <div className="chg-track">
          {fromPos != null && <span className="chg-mark from" style={{ left: `${fromPos * 100}%` }} />}
          <span className="chg-mark to" style={{ left: `${toPos * 100}%` }} />
        </div>
      </div>
    );
  }
  if (v.kind === "balance") {
    const pos = clamp(0.5 + clamp(Math.log2(Math.max(v.ratio, 0.01)) / 2, -0.5, 0.5), 0, 1);
    return (
      <div className="chg">
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
      <div className="chg viz-bar">
        <div className="vbar-track">
          <div className={`vbar-fill tone-${v.tone}`} style={{ width: `${clamp(v.value, 0, 1) * 100}%` }} />
        </div>
        <span className="vbar-val">{Math.round(clamp(v.value, 0, 1) * 100)}%</span>
      </div>
    );
  }
  return (
    <div className={`chg viz-dir dir-${v.dir}`}>
      <span className="vd-arrow">{v.dir === "more" ? "▲" : "▼"}</span>
      {v.dir === "more" ? "more" : "less"} {v.label}
    </div>
  );
}

function round(x: number) {
  return Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 100) / 100;
}

function AdviceCard({ a }: { a: Advice }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="adv">
      <div className="adv-head">
        <span className="adv-area">{a.area}</span>
        <span className={`conf-dot ${a.confidence}`} title={CONF_TEXT[a.confidence]} />
        <button
          className="adv-info"
          aria-label="why & outcome"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "×" : "ⓘ"}
        </button>
      </div>
      <div className="adv-rec">{a.recommendation}</div>
      {a.viz && <Viz v={a.viz} />}
      {open && (
        <div className="adv-more">
          <p>
            <span className="adv-tag">Why</span> {a.why}
          </p>
          <p>
            <span className="adv-tag">Outcome</span> {a.outcome}
          </p>
        </div>
      )}
    </li>
  );
}

export function AdvicePanel({ advice, enoughData }: { advice: Advice[]; enoughData: boolean }) {
  const byGroup = new Map<AdviceGroup, Advice[]>();
  for (const a of advice) {
    const g = a.group ?? "general";
    const arr = byGroup.get(g) ?? [];
    arr.push(a);
    byGroup.set(g, arr);
  }
  for (const arr of byGroup.values())
    arr.sort((x, y) => CONFIDENCE_RANK[x.confidence] - CONFIDENCE_RANK[y.confidence]);

  return (
    <section className="advice">
      <div className="advice-titlebar">
        <h2>Tuning advice</h2>
        <span className="advice-sub">grouped by tune area · ⓘ for why & trade-off</span>
      </div>

      {!enoughData ? (
        <div className="advice-empty">
          Keep driving — push through corners, braking zones, and full-throttle pulls. Advice builds
          up as the session gathers data (see Data coverage below).
        </div>
      ) : advice.length === 0 ? (
        <div className="advice-empty">
          Nothing to flag — the car looks balanced for how you've driven. Drive harder or adjust your
          priorities to surface opportunities.
        </div>
      ) : (
        <div className="advice-groups">
          {GROUP_ORDER.map((gid) => {
            const items = byGroup.get(gid);
            if (!items || items.length === 0) return null;
            const meta = GROUP_META[gid];
            return (
              <div key={gid} className="advgroup">
                <div className="advgroup-head">
                  <span className="advgroup-icon">{meta.icon}</span>
                  <span className="advgroup-title">{meta.title}</span>
                </div>
                <ul className="advgroup-list">
                  {items.map((a) => (
                    <AdviceCard key={a.id} a={a} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p className="advice-foot">
        Numbers come from your data; enter your current tune above for exact targets. Alignment isn't
        shown — the feed can't measure it.
      </p>
    </section>
  );
}

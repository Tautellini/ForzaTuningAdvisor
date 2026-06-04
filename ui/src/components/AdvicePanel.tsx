import { useState } from "react";
import type { Advice, AdviceGroup, AdviceViz, Confidence } from "../advice/engine";
import { CONFIDENCE_RANK } from "../advice/engine";
import { TUNE_GROUPS, type CurrentTune } from "../tune";
import type { Units } from "../units";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const CONF_TEXT: Record<Confidence, string> = {
  high: "high confidence",
  medium: "medium confidence",
  low: "low confidence — treat as a hint",
};

/** Current tune values for a group, for the "no change" placeholder. */
function currentValues(
  groupId: string,
  tune: CurrentTune,
  units: Units,
  drivetrain?: number,
): string[] {
  const g = TUNE_GROUPS.find((x) => x.id === groupId);
  if (!g) return [];
  if (g.gearing) {
    const parts: string[] = [];
    if (tune.finalDrive != null) parts.push(`Final drive ${tune.finalDrive}`);
    const gr = (tune.gearRatios ?? []).filter((x) => Number.isFinite(x));
    if (gr.length) parts.push(`${gr.length} gear ratios set`);
    return parts;
  }
  return g.fields
    .filter(
      (f) =>
        (!f.drivetrains || drivetrain == null || f.drivetrains.includes(drivetrain)) &&
        tune[f.key] != null,
    )
    .map((f) => {
      const u = f.unit(units);
      return `${f.label} ${tune[f.key]}${u ? " " + u : ""}`;
    });
}

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

interface PanelProps {
  advice: Advice[];
  enoughData: boolean;
  tune: CurrentTune;
  units: Units;
  drivetrain?: number;
}

export function AdvicePanel({ advice, enoughData, tune, units, drivetrain }: PanelProps) {
  const byGroup = new Map<AdviceGroup, Advice[]>();
  for (const a of advice) {
    const g = a.group ?? "general";
    const arr = byGroup.get(g) ?? [];
    arr.push(a);
    byGroup.set(g, arr);
  }
  for (const arr of byGroup.values())
    arr.sort((x, y) => CONFIDENCE_RANK[x.confidence] - CONFIDENCE_RANK[y.confidence]);

  const general = byGroup.get("general") ?? [];

  return (
    <section className="advice">
      <div className="advice-titlebar">
        <h2>Tuning advice</h2>
        <span className="advice-sub">every tune area · ⓘ for why & trade-off</span>
      </div>

      {!enoughData && (
        <div className="advice-empty">
          Advice firms up as you gather data (see Data coverage below) — keep driving through corners,
          braking zones, and full-throttle pulls.
        </div>
      )}

      <div className="advice-groups">
        {TUNE_GROUPS.map((g) => {
          const items = byGroup.get(g.id as AdviceGroup) ?? [];
          const current = currentValues(g.id, tune, units, drivetrain);
          return (
            <div key={g.id} className="advgroup">
              <div className="advgroup-head">
                <span className="advgroup-icon">{g.icon}</span>
                <span className="advgroup-title">{g.title}</span>
              </div>
              {items.length > 0 ? (
                <ul className="advgroup-list">
                  {items.map((a) => (
                    <AdviceCard key={a.id} a={a} />
                  ))}
                </ul>
              ) : (
                <div className="adv-none">
                  <span className="adv-none-tag">No change suggested</span>
                  {current.length > 0 ? (
                    <span className="adv-none-cur">{current.join(" · ")}</span>
                  ) : (
                    <span className="adv-none-cur muted">current values not entered</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {general.length > 0 && (
          <div className="advgroup">
            <div className="advgroup-head">
              <span className="advgroup-icon">✨</span>
              <span className="advgroup-title">General</span>
            </div>
            <ul className="advgroup-list">
              {general.map((a) => (
                <AdviceCard key={a.id} a={a} />
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="advice-foot">
        Numbers come from your data; enter your current tune above for exact targets. Camber is
        roll-estimated; toe/caster are guidance only.
      </p>
    </section>
  );
}

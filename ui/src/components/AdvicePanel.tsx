import { useState } from "react";
import type { Advice, AdviceGroup, AdviceViz, Confidence } from "../advice/engine";
import { CONFIDENCE_RANK } from "../advice/engine";
import type { SessionSummary } from "../session";
import { TUNE_GROUPS, type CurrentTune } from "../tune";
import { tempC, type Units } from "../units";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Current measured state for a group, used when no change is suggested — same
 *  viz kinds as the advice, just shown in a calm "good" appearance. */
function groupStatus(
  id: string,
  s: SessionSummary | null,
  units: Units,
): { note: string; viz?: AdviceViz } {
  if (!s) return { note: "No data yet" };
  switch (id) {
    case "tires": {
      const peak = Math.max(s.tireTempAvg.fl, s.tireTempAvg.fr, s.tireTempAvg.rl, s.tireTempAvg.rr);
      const tc = tempC(peak, units);
      return { note: `Temps OK (peak ${Math.round(tc.v)}${tc.unit})`, viz: { kind: "bar", value: clamp((peak - 150) / 110, 0, 1), tone: "good" } };
    }
    case "gearing": {
      const gn = Object.keys(s.gears).map(Number).filter((g) => s.gears[g].k > 0).sort((a, b) => a - b);
      if (!gn.length) return { note: "Drive to map gearing" };
      const sf = units.system === "imperial" ? { f: 0.621371, unit: "mph" } : { f: 1, unit: "km/h" };
      return {
        note: "Spacing looks fine",
        viz: { kind: "gears", unit: sf.unit, redline: s.redline, gears: gn.map((g) => ({ g, speed: Math.round(s.gears[g].maxSpeedKmh * sf.f) })) },
      };
    }
    case "alignment":
      return { note: `Body roll ~${s.frontRollDeg.toFixed(1)}°`, viz: { kind: "bar", value: clamp(s.frontRollDeg / 5, 0, 1), tone: "good" } };
    case "arb":
      return { note: "Balanced", viz: { kind: "balance", ratio: s.understeerRatio } };
    case "springs":
      return { note: "No bottoming", viz: { kind: "bar", value: Math.max(s.bottoming.front, s.bottoming.rear), tone: "good" } };
    case "damping":
      return { note: "Settles OK", viz: { kind: "bar", value: clamp(Math.max(s.frontReversalRate, s.rearReversalRate) / 6, 0, 1), tone: "good" } };
    case "aero":
      return { note: "Grip in hand at speed", viz: { kind: "bar", value: s.highSpeedNearLimitFrac, tone: "good" } };
    case "brakes":
      return { note: "No lockup", viz: { kind: "bar", value: Math.max(s.frontLockFrac, s.rearLockFrac), tone: "good" } };
    case "diff":
      return { note: "Traction OK", viz: { kind: "bar", value: s.wheelspinFrac, tone: "good" } };
    default:
      return { note: "No change" };
  }
}

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
  if (v.kind === "gears") {
    const max = Math.max(1, ...v.gears.map((g) => g.speed));
    return (
      <div className="chg gears-viz">
        {v.gears.map((g) => (
          <div className="gv-row" key={g.g}>
            <span className="gv-g">{g.g}</span>
            <div className="gv-bar">
              <div className="gv-fill" style={{ width: `${(g.speed / max) * 100}%` }} />
            </div>
            <span className="gv-kmh">
              {g.speed} {v.unit}
            </span>
            {g.shift != null && <span className="gv-shift">↑{(g.shift / 1000).toFixed(1)}k</span>}
          </div>
        ))}
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
  summary: SessionSummary | null;
  tune: CurrentTune;
  units: Units;
  drivetrain?: number;
}

export function AdvicePanel({ advice, enoughData, summary, tune, units, drivetrain }: PanelProps) {
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
                (() => {
                  const st = groupStatus(g.id, summary, units);
                  return (
                    <div className="adv adv-ok">
                      <div className="adv-head">
                        <span className="adv-area">{st.note}</span>
                        <span className="conf-dot good" title="no change needed" />
                      </div>
                      {current.length > 0 && <div className="adv-none-cur">{current.join(" · ")}</div>}
                      {st.viz && <Viz v={st.viz} />}
                    </div>
                  );
                })()
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

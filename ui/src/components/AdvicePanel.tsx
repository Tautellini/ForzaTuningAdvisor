import { useState } from "react";
import type { Advice, AdviceViz, Confidence } from "../advice/engine";
import type { SessionSummary } from "../session";
import type { CornerKey } from "../types";
import { TUNE_GROUPS, type CurrentTune, type TuneField } from "../tune";
import { tempC, type Units } from "../units";
import { InfoDot } from "./InfoDot";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const CONF_TEXT: Record<Confidence, string> = {
  high: "high confidence",
  medium: "medium confidence",
  low: "low confidence — treat as a hint",
};

// Map an advice to the specific lever (tune field) it targets.
function adviceField(a: Advice): keyof CurrentTune | undefined {
  if (a.field) return a.field;
  switch (a.id) {
    case "balance-understeer":
    case "balance-oversteer":
      return "frontARB";
    case "camber-front":
      return "frontCamber";
    case "camber-rear":
      return "rearCamber";
    case "brake-front-lock":
    case "brake-rear-lock":
      return "brakeBalance";
    case "diff-front":
      return "frontDiffAccel";
    case "diff-rear":
      return "rearDiffAccel";
    case "diff-center":
      return "centerBalance";
    case "bottoming-front":
      return "frontRideHeight";
    case "bottoming-rear":
      return "rearRideHeight";
    case "unload-front":
      return "frontSprings";
    case "unload-rear":
      return "rearSprings";
    case "damping-front":
      return "frontRebound";
    case "damping-rear":
      return "rearRebound";
    default:
      return undefined;
  }
}

// Current measured state for a lever, shown green when no change is needed.
function leverStatus(key: keyof CurrentTune, s: SessionSummary | null, units: Units): {
  note: string;
  viz?: AdviceViz;
} {
  if (!s) return { note: "no data yet" };
  const tempBar = (a: CornerKey, b: CornerKey) => {
    const t = (s.tireTempAvg[a] + s.tireTempAvg[b]) / 2;
    const tc = tempC(t, units);
    return { note: `temps ok (${Math.round(tc.v)}${tc.unit})`, viz: { kind: "bar" as const, value: clamp((t - 150) / 110, 0, 1), tone: "good" as const } };
  };
  switch (key) {
    case "frontPressure":
      return tempBar("fl", "fr");
    case "rearPressure":
      return tempBar("rl", "rr");
    case "frontARB":
    case "rearARB":
      return { note: "balanced", viz: { kind: "balance", ratio: s.understeerRatio } };
    case "frontCamber":
      return { note: `roll ~${s.frontRollDeg.toFixed(1)}°`, viz: { kind: "bar", value: clamp(s.frontRollDeg / 5, 0, 1), tone: "good" } };
    case "rearCamber":
      return { note: `roll ~${s.rearRollDeg.toFixed(1)}°`, viz: { kind: "bar", value: clamp(s.rearRollDeg / 5, 0, 1), tone: "good" } };
    case "frontToe":
    case "rearToe":
      return { note: "keep minimal (rear toe-in adds stability)" };
    case "caster":
      return { note: "run high for grip & stability" };
    case "frontSprings":
    case "frontRideHeight":
      return { note: "no bottoming", viz: { kind: "bar", value: s.bottoming.front, tone: "good" } };
    case "rearSprings":
    case "rearRideHeight":
      return { note: "no bottoming", viz: { kind: "bar", value: s.bottoming.rear, tone: "good" } };
    case "frontBump":
    case "frontRebound":
      return { note: "settles ok", viz: { kind: "bar", value: clamp(s.frontReversalRate / 6, 0, 1), tone: "good" } };
    case "rearBump":
    case "rearRebound":
      return { note: "settles ok", viz: { kind: "bar", value: clamp(s.rearReversalRate / 6, 0, 1), tone: "good" } };
    case "frontAero":
    case "rearAero":
      return { note: "grip in hand at speed", viz: { kind: "bar", value: s.highSpeedNearLimitFrac, tone: "good" } };
    case "brakeBalance":
      return { note: "no lockup", viz: { kind: "bar", value: Math.max(s.frontLockFrac, s.rearLockFrac), tone: "good" } };
    case "brakePressure":
      return { note: "no lockup" };
    case "frontDiffAccel":
      return { note: "traction ok", viz: { kind: "bar", value: s.frontSpinFrac, tone: "good" } };
    case "rearDiffAccel":
      return { note: "traction ok", viz: { kind: "bar", value: s.rearSpinFrac, tone: "good" } };
    default:
      return { note: "looks fine" };
  }
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
  if (v.kind === "ratioset") {
    return (
      <div className="chg ratioset">
        {v.rows.map((r) => {
          const changed = Math.abs(r.to - r.from) / r.from >= 0.02;
          return (
            <div className="rs-row" key={r.g}>
              <span className="rs-g">{r.g}</span>
              <span className="rs-from">{r.from.toFixed(2)}</span>
              <span className={`rs-arrow ${changed ? "on" : ""}`}>→</span>
              <span className={`rs-to ${changed ? "on" : ""}`}>{r.to.toFixed(2)}</span>
            </div>
          );
        })}
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
  const state = a.kind === "opportunity" || a.confidence === "low" ? "neutral" : "change";
  return (
    <li className={`adv adv-${state}`}>
      <div className="adv-head">
        <span className="adv-area">{a.area}</span>
        <span className={`conf-dot ${a.confidence}`} title={CONF_TEXT[a.confidence]} />
        <button className="adv-info" aria-label="why & outcome" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
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

function OkRow({
  field,
  summary,
  tune,
  units,
}: {
  field: TuneField;
  summary: SessionSummary | null;
  tune: CurrentTune;
  units: Units;
}) {
  const st = leverStatus(field.key, summary, units);
  const cur = tune[field.key];
  const u = field.unit(units);
  return (
    <li className="adv adv-ok">
      <div className="adv-head">
        <span className="adv-area">{field.label}</span>
        <span className="conf-dot good" title="no change needed" />
      </div>
      <div className="adv-rec ok">
        {cur != null ? `${cur}${u ? " " + u : ""}` : "—"} <span className="ok-note">· {st.note}</span>
      </div>
      {st.viz && <Viz v={st.viz} />}
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
  const general = advice.filter((a) => (a.group ?? "general") === "general");

  return (
    <section className="advice">
      <div className="advice-titlebar">
        <h2>Tuning advice</h2>
        <InfoDot text="Every adjustable lever. Amber = change suggested, green = fine. Click a card's ⓘ for why & trade-off. Numbers come from your data; enter your current tune for exact targets. Camber is roll-estimated; toe/caster are guidance only." />
      </div>

      {!enoughData && (
        <div className="advice-empty">
          Advice firms up as you gather data (see Data coverage below) — keep driving through corners,
          braking zones, and full-throttle pulls.
        </div>
      )}

      <div className="advice-groups">
        {TUNE_GROUPS.map((g) => {
          const groupAdvice = advice.filter((a) => a.group === g.id);
          const leverFields = g.gearing
            ? []
            : g.fields.filter((f) => !f.drivetrains || drivetrain == null || f.drivetrains.includes(drivetrain));
          const leverKeys = new Set<string>(leverFields.map((f) => f.key));
          const byField = new Map<string, Advice>();
          const groupCards: Advice[] = [];
          for (const a of groupAdvice) {
            const fk = adviceField(a);
            if (fk && leverKeys.has(fk)) byField.set(fk, a);
            else groupCards.push(a);
          }

          return (
            <div key={g.id} className="advgroup">
              <div className="advgroup-head">
                <span className="advgroup-icon">{g.icon}</span>
                <span className="advgroup-title">{g.title}</span>
                {g.note && <InfoDot text={g.note} />}
              </div>
              <ul className="advgroup-list">
                {groupCards.map((a) => (
                  <AdviceCard key={a.id} a={a} />
                ))}
                {leverFields.map((f) => {
                  const a = byField.get(f.key);
                  return a ? (
                    <AdviceCard key={f.key} a={a} />
                  ) : (
                    <OkRow key={f.key} field={f} summary={summary} tune={tune} units={units} />
                  );
                })}
                {g.gearing && groupCards.length === 0 && summary && (
                  <li className="adv adv-ok">
                    <div className="adv-head">
                      <span className="adv-area">Gearing</span>
                      <span className="conf-dot good" title="no change needed" />
                    </div>
                    <div className="adv-rec ok">
                      <span className="ok-note">spacing looks fine</span>
                    </div>
                  </li>
                )}
              </ul>
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

    </section>
  );
}

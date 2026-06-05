import type { CurrentTune } from "../tune";
import { TUNE_GROUPS } from "../tune";
import type { Units } from "../units";

/** Compact read-only rendering of a tune sheet — only the fields that are set. */
export function TuneSheet({ tune, units }: { tune: CurrentTune; units: Units }) {
  const groups = TUNE_GROUPS.map((g) => {
    if (g.gearing) {
      const rows: { label: string; value: string }[] = [];
      if (tune.finalDrive != null) rows.push({ label: "Final drive", value: String(tune.finalDrive) });
      (tune.gearRatios ?? []).forEach((r, i) => {
        if (r != null && Number.isFinite(r)) rows.push({ label: `Gear ${i + 1}`, value: String(r) });
      });
      return { id: g.id, title: g.title, icon: g.icon, rows };
    }
    const rows = g.fields
      .filter((f) => tune[f.key] != null)
      .map((f) => ({ label: f.label, value: `${tune[f.key]} ${f.unit(units)}`.trim() }));
    return { id: g.id, title: g.title, icon: g.icon, rows };
  }).filter((g) => g.rows.length > 0);

  if (groups.length === 0) return <p className="muted ts-empty">No values entered on this sheet.</p>;

  return (
    <div className="tunesheet">
      {groups.map((g) => (
        <div key={g.id} className="ts-group">
          <div className="ts-head">
            <span className="tg-icon">{g.icon}</span>
            {g.title}
          </div>
          {g.rows.map((r) => (
            <div key={r.label} className="ts-row">
              <span className="ts-label">{r.label}</span>
              <span className="ts-value">{r.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
import type { GarageStore } from "../garage/store";
import { searchCars, carInfo, type CarInfo } from "../carDb";
import { exportFull, importData, type ImportResult } from "../garage/exportImport";
import type { DisciplineId } from "../discipline";
import type { Units } from "../units";
import { CarPage } from "./CarPage";

const RESULT_CAP = 60;

function importSummary(r: ImportResult): string {
  const parts: string[] = [];
  if (r.setupsAdded) parts.push(`${r.setupsAdded} setup${r.setupsAdded === 1 ? "" : "s"} added`);
  if (r.setupsCopied) parts.push(`${r.setupsCopied} imported as copies (id existed)`);
  if (r.setupsSkipped) parts.push(`${r.setupsSkipped} already present`);
  if (r.workspacesAdopted) parts.push(`${r.workspacesAdopted} workspace${r.workspacesAdopted === 1 ? "" : "s"} adopted`);
  if (r.workspacesArchived) parts.push(`${r.workspacesArchived} workspace${r.workspacesArchived === 1 ? "" : "s"} kept as setups (local data wins)`);
  if (r.workspacesSkipped) parts.push(`${r.workspacesSkipped} workspace${r.workspacesSkipped === 1 ? "" : "s"} already present`);
  return parts.length ? `Imported: ${parts.join(", ")}.` : "Nothing new in that file.";
}

export function GarageView({
  garage,
  units,
  discipline,
  rev,
  carDbOk,
  onGoLive,
}: {
  garage: GarageStore;
  units: Units;
  discipline: DisciplineId;
  rev: number;
  carDbOk: boolean | null;
  onGoLive: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cars with data, most recently touched first.
  const myCars = useMemo(() => {
    void rev;
    const ords = garage.ordinalsWithData();
    const touched = (o: number) =>
      Math.max(
        garage.workspaces.get(o)?.updatedAt ?? 0,
        garage.setupsOf(o)[0]?.savedAt ?? 0,
      );
    return [...ords].sort((a, b) => touched(b) - touched(a));
  }, [garage, rev]);

  const results = useMemo(() => {
    if (!query.trim()) return null;
    const withData = garage.ordinalsWithData();
    const all = searchCars(query);
    // cars you have data for surface first
    return all
      .sort((a, b) => Number(withData.has(b.ordinal)) - Number(withData.has(a.ordinal)) || a.year - b.year)
      .slice(0, RESULT_CAP)
      .map((c) => ({ car: c, hasData: withData.has(c.ordinal) }));
  }, [garage, query, rev]);

  const onImportFile = async (f: File) => {
    try {
      const res = importData(garage, await f.text());
      setImportMsg({ kind: "ok", text: importSummary(res) });
    } catch (e) {
      setImportMsg({ kind: "err", text: e instanceof Error ? e.message : "Import failed." });
    }
  };

  if (!garage.ready) {
    return (
      <div className="panel center">
        <div className="spinner" />
        <p>Opening the garage…</p>
      </div>
    );
  }

  if (selected != null) {
    return (
      <CarPage
        garage={garage}
        ordinal={selected}
        units={units}
        discipline={discipline}
        onBack={() => setSelected(null)}
        onGoLive={onGoLive}
      />
    );
  }

  const sessionCount = (o: number) => garage.workspaces.get(o)?.sessions.length ?? 0;

  return (
    <div className="garageview">
      <div className="gv-toolbar">
        <input
          className="gv-search"
          type="search"
          placeholder="Search all cars — year, make or model…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button className="dlg-btn tonal" onClick={() => fileRef.current?.click()}>
          Import…
        </button>
        <button className="dlg-btn ghost" onClick={() => exportFull(garage)} title="One file with every car's data">
          Export all
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {importMsg && (
        <div className={`gv-msg ${importMsg.kind}`} role="status">
          {importMsg.text}
          <button className="link-btn" onClick={() => setImportMsg(null)}>
            dismiss
          </button>
        </div>
      )}
      {carDbOk === false && (
        <div className="gv-msg err" role="status">
          Couldn't load the car name database — names fall back to ordinals. Reload to retry.
        </div>
      )}
      {garage.backendKind === "local" && (
        <div className="gv-msg err" role="status">
          IndexedDB is unavailable — using basic storage with a tight size budget.
        </div>
      )}

      {results ? (
        <div className="gv-list">
          {results.length === 0 && <p className="muted">No cars match “{query}”.</p>}
          {results.map(({ car, hasData }) => (
            <CarRow
              key={car.ordinal}
              car={car}
              hasData={hasData}
              setups={garage.setupsOf(car.ordinal).length}
              sessions={sessionCount(car.ordinal)}
              onOpen={() => setSelected(car.ordinal)}
            />
          ))}
          {results.length === RESULT_CAP && <p className="muted">Showing the first {RESULT_CAP} — refine the search.</p>}
        </div>
      ) : (
        <>
          <h3 className="gv-heading">My garage</h3>
          {myCars.length === 0 ? (
            <p className="muted">
              No saved cars yet. Drive with the bridge running — sessions land here automatically. Or import a
              backup file.
            </p>
          ) : (
            <div className="gv-list">
              {myCars.map((o) => {
                const car = carInfo(o);
                return (
                  <CarRow
                    key={o}
                    car={car ?? { ordinal: o, name: `Unknown car (#${o})`, year: 0, make: "", model: "" }}
                    hasData
                    setups={garage.setupsOf(o).length}
                    sessions={sessionCount(o)}
                    onOpen={() => setSelected(o)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CarRow({
  car,
  hasData,
  setups,
  sessions,
  onOpen,
}: {
  car: CarInfo;
  hasData: boolean;
  setups: number;
  sessions: number;
  onOpen: () => void;
}) {
  return (
    <button className="carrow" onClick={onOpen}>
      <span className="carrow-name">{car.name}</span>
      <span className="carrow-meta">
        {hasData && sessions > 0 && <span className="chip">{sessions} session{sessions === 1 ? "" : "s"}</span>}
        {hasData && setups > 0 && <span className="chip">{setups} setup{setups === 1 ? "" : "s"}</span>}
        {hasData && setups === 0 && sessions === 0 && <span className="chip">tune</span>}
        <span className="carrow-go">›</span>
      </span>
    </button>
  );
}

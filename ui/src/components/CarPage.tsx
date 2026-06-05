import { useEffect, useState } from "react";
import type { GarageStore } from "../garage/store";
import type { CuratedSetup } from "../garage/model";
import { workspaceIsEmpty } from "../garage/model";
import type { CurrentTune } from "../tune";
import type { DisciplineId } from "../discipline";
import type { Units } from "../units";
import { loadCurated } from "../garage/curated";
import { exportCar, exportSetup } from "../garage/exportImport";
import { CarIdentity } from "./CarIdentity";
import { ConfirmDialog } from "./ConfirmDialog";
import { CuratedCard, SetupCard } from "./SetupCard";
import { TuneSheet } from "./TuneSheet";
import { InfoDot } from "./InfoDot";

type LoadTarget =
  | { kind: "setup"; id: string; withSessions: boolean; name: string }
  | { kind: "curated"; tune: CurrentTune; name: string };

export function CarPage({
  garage,
  ordinal,
  units,
  discipline,
  onBack,
  onGoLive,
}: {
  garage: GarageStore;
  ordinal: number;
  units: Units;
  discipline: DisciplineId;
  onBack: () => void;
  onGoLive: () => void;
}) {
  const [curated, setCurated] = useState<CuratedSetup[]>([]);
  const [loadTarget, setLoadTarget] = useState<LoadTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");

  useEffect(() => {
    let alive = true;
    void loadCurated().then((list) => {
      if (alive) setCurated(list.filter((s) => s.ordinal === ordinal));
    });
    return () => {
      alive = false;
    };
  }, [ordinal]);

  const ws = garage.workspace(ordinal);
  const setups = garage.setupsOf(ordinal);
  const poolCount = ws.sessions.length + (garage.recordingFor(ordinal) ? 1 : 0);
  const drivingThis = garage.detectedOrdinal === ordinal;

  const performLoad = (t: LoadTarget, archiveFirst: boolean) => {
    if (archiveFirst) garage.saveSetup(ordinal, "", discipline);
    if (t.kind === "setup") garage.applySetup(t.id, t.withSessions);
    else garage.applyTune(ordinal, t.tune);
    setLoadTarget(null);
  };
  const requestLoad = (t: LoadTarget) => {
    if (poolCount > 0) setLoadTarget(t);
    else performLoad(t, false);
  };

  return (
    <div className="carpage">
      <div className="cp-head">
        <button className="link-btn" onClick={onBack}>
          ← All cars
        </button>
        <CarIdentity ordinal={ordinal} build={ws.build} size="lg" />
        {drivingThis && <span className="chip chip-live">driving now</span>}
        <span className="cp-spacer" />
        <button className="dlg-btn tonal" onClick={() => { garage.setViewed(ordinal); onGoLive(); }}>
          View in Live
        </button>
        <button className="link-btn" onClick={() => exportCar(garage, ordinal)} title="Download this car's data">
          export car
        </button>
      </div>

      <section className="cp-section">
        <div className="cp-section-head">
          <h3>Current workspace</h3>
          <InfoDot text="The tune you're running now and the sessions driven on it. Archive it as a setup to keep it forever and start a fresh pool." />
        </div>
        {workspaceIsEmpty(ws) && poolCount === 0 ? (
          <p className="muted">Nothing yet — drive this car or enter its tune in the Live view.</p>
        ) : (
          <>
            <p className="cp-pool muted">
              {poolCount} session{poolCount === 1 ? "" : "s"} in the active pool
              {garage.recordingFor(ordinal) ? " (recording)" : ""}
            </p>
            <TuneSheet tune={ws.tune} units={units} />
            <form
              className="cp-saveform"
              onSubmit={(e) => {
                e.preventDefault();
                if (garage.saveSetup(ordinal, saveName, discipline)) setSaveName("");
              }}
            >
              <input
                type="text"
                placeholder={`Setup ${setups.length + 1}`}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
              <button type="submit" className="dlg-btn primary">
                Archive as setup
              </button>
            </form>
          </>
        )}
      </section>

      <section className="cp-section">
        <div className="cp-section-head">
          <h3>Saved setups</h3>
          <span className="ss-count">{setups.length}</span>
        </div>
        {setups.length === 0 ? (
          <p className="muted">No archived setups for this car yet.</p>
        ) : (
          <div className="cp-cards">
            {setups.map((s) => (
              <SetupCard
                key={s.id}
                setup={s}
                currentBuild={ws.build}
                units={units}
                onLoad={() => requestLoad({ kind: "setup", id: s.id, withSessions: true, name: s.name })}
                onLoadSheetOnly={() => requestLoad({ kind: "setup", id: s.id, withSessions: false, name: s.name })}
                onExport={() => exportSetup(garage, s.id)}
                onDelete={() => setDeleteTarget(s.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="cp-section">
        <div className="cp-section-head">
          <h3>Curated setups</h3>
          <InfoDot text="Known-good setups bundled with the app. Loading copies the sheet into your current tune — the curated entry stays untouched. Want yours here? Export it as a share file and submit it to the project." />
        </div>
        {curated.length === 0 ? (
          <p className="muted">None for this car yet.</p>
        ) : (
          <div className="cp-cards">
            {curated.map((s) => (
              <CuratedCard
                key={s.id}
                setup={s}
                currentBuild={ws.build}
                units={units}
                onLoad={() => requestLoad({ kind: "curated", tune: s.tune, name: s.name })}
              />
            ))}
          </div>
        )}
      </section>

      {loadTarget && (
        <ConfirmDialog
          title={`Load “${loadTarget.name}”?`}
          actions={[
            { label: "Archive pool & load", kind: "primary", onClick: () => performLoad(loadTarget, true) },
            { label: "Discard pool & load", kind: "danger", onClick: () => performLoad(loadTarget, false) },
            { label: "Cancel", kind: "ghost", onClick: () => setLoadTarget(null) },
          ]}
        >
          <p>
            The active pool has {poolCount} session{poolCount === 1 ? "" : "s"} driven on the current tune.
            Archive them as a setup first, or discard them?
          </p>
        </ConfirmDialog>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this setup?"
          actions={[
            {
              label: "Delete",
              kind: "danger",
              onClick: () => {
                garage.deleteSetup(deleteTarget);
                setDeleteTarget(null);
              },
            },
            { label: "Cancel", kind: "ghost", onClick: () => setDeleteTarget(null) },
          ]}
        >
          <p>The setup and its recorded sessions are removed for good (export it first if unsure).</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

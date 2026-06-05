import { useState } from "react";
import type { BuildIdentity, CuratedSetup, SavedSetup } from "../garage/model";
import { DISCIPLINE_BY_ID } from "../discipline";
import type { SnapshotMetrics } from "../tuninglog";
import type { Units } from "../units";
import type { CurrentTune } from "../tune";
import { classLabel } from "../carDb";
import { DRIVETRAIN } from "../types";
import { TuneSheet } from "./TuneSheet";

function buildLabel(b: BuildIdentity | null): string {
  if (!b) return "unknown build";
  return `${classLabel(b.class, b.pi)} ${DRIVETRAIN[b.drivetrain] ?? "?"}`;
}

function buildsDiffer(a: BuildIdentity | null, b: BuildIdentity | null): boolean {
  if (!a || !b) return false; // can't judge -> don't cry wolf
  return a.pi !== b.pi || a.class !== b.class || a.drivetrain !== b.drivetrain;
}

function MetricChips({ m }: { m: SnapshotMetrics | null }) {
  if (!m) return null;
  const bal = m.understeerRatio >= 1.15 ? "understeer" : m.understeerRatio <= 0.87 ? "oversteer" : "neutral";
  return (
    <>
      <span className={`ss-tag ${bal}`}>{bal}</span>
      <span className="ss-tag muted">{m.maxLatG.toFixed(2)}g</span>
    </>
  );
}

function BuildMismatch({ saved, current }: { saved: BuildIdentity | null; current: BuildIdentity | null }) {
  if (!buildsDiffer(saved, current)) return null;
  return (
    <span className="chip chip-warn" title="This setup was made for a different build of this car.">
      saved at {buildLabel(saved)} — car is {buildLabel(current)}
    </span>
  );
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });

interface CommonShellProps {
  name: string;
  meta: string;
  tune: CurrentTune;
  units: Units;
  m: SnapshotMetrics | null;
  savedBuild: BuildIdentity | null;
  currentBuild: BuildIdentity | null;
  note?: string;
  children: React.ReactNode; // actions row
}

function CardShell({ name, meta, tune, units, m, savedBuild, currentBuild, note, children }: CommonShellProps) {
  const [showSheet, setShowSheet] = useState(false);
  return (
    <div className="setupcard">
      <div className="sc-top">
        <span className="sc-name">{name}</span>
        <span className="sc-meta">{meta}</span>
      </div>
      <div className="sc-chips">
        <span className="chip chip-class">{buildLabel(savedBuild)}</span>
        <MetricChips m={m} />
        <BuildMismatch saved={savedBuild} current={currentBuild} />
      </div>
      {note && <p className="sc-note">{note}</p>}
      <button className="link-btn" onClick={() => setShowSheet((v) => !v)}>
        {showSheet ? "hide sheet" : "view sheet"}
      </button>
      {showSheet && <TuneSheet tune={tune} units={units} />}
      <div className="sc-actions">{children}</div>
    </div>
  );
}

export function SetupCard({
  setup,
  currentBuild,
  units,
  onLoad,
  onLoadSheetOnly,
  onExport,
  onDelete,
}: {
  setup: SavedSetup;
  currentBuild: BuildIdentity | null;
  units: Units;
  onLoad: () => void;
  onLoadSheetOnly: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const d = DISCIPLINE_BY_ID[setup.discipline];
  const sessions = setup.sessions.length;
  const meta = `${fmtDate(setup.savedAt)} · ${d?.label ?? setup.discipline} · ${sessions} session${sessions === 1 ? "" : "s"}`;
  return (
    <CardShell
      name={setup.name}
      meta={meta}
      tune={setup.tune}
      units={units}
      m={setup.m}
      savedBuild={setup.build}
      currentBuild={currentBuild}
      note={setup.note}
    >
      <button className="dlg-btn tonal" onClick={onLoad} title="Copy sheet + sessions back into the workspace">
        Load
      </button>
      <button className="link-btn" onClick={onLoadSheetOnly} title="Copy only the tune sheet">
        sheet only
      </button>
      <button className="link-btn" onClick={onExport} title="Download as a share file">
        export
      </button>
      <button className="link-btn danger" onClick={onDelete}>
        delete
      </button>
    </CardShell>
  );
}

export function CuratedCard({
  setup,
  currentBuild,
  units,
  onLoad,
}: {
  setup: CuratedSetup;
  currentBuild: BuildIdentity | null;
  units: Units;
  onLoad: () => void;
}) {
  const d = DISCIPLINE_BY_ID[setup.discipline];
  const meta = `${d?.label ?? setup.discipline}${setup.author ? ` · by ${setup.author}` : ""}`;
  return (
    <CardShell
      name={setup.name}
      meta={meta}
      tune={setup.tune}
      units={units}
      m={setup.m}
      savedBuild={setup.build}
      currentBuild={currentBuild}
      note={setup.note}
    >
      <button className="dlg-btn tonal" onClick={onLoad} title="Copy this sheet into the car's current tune">
        Load sheet
      </button>
    </CardShell>
  );
}

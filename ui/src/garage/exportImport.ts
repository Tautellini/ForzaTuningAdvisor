// Export/import of garage data as JSON files. Three granularities (full
// backup, one car, one setup); import always merges by id and never silently
// overwrites — colliding ids with different content come in as a copy.

import { mergeData, summarize } from "../session";
import { metricsFrom } from "../tuninglog";
import { carInfo } from "../carDb";
import { normalizeDisciplineId } from "../discipline";
import type { ExportFile, SavedSetup, Workspace } from "./model";
import { workspaceIsEmpty } from "./model";
import type { GarageStore } from "./store";

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function download(filename: string, data: ExportFile) {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

function carSlug(ordinal: number): string {
  const c = carInfo(ordinal);
  if (!c) return `car-${ordinal}`;
  return c.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function file(kind: ExportFile["kind"], payload: ExportFile["payload"]): ExportFile {
  return { format: "fta-export", version: 1, kind, exportedAt: Date.now(), payload };
}

export function exportFull(store: GarageStore) {
  const workspaces = [...store.workspaces.values()].filter((w) => !workspaceIsEmpty(w));
  download(`fta-backup-${today()}.json`, file("full", { workspaces, setups: store.setups }));
}

export function exportCar(store: GarageStore, ordinal: number) {
  const w = store.workspaces.get(ordinal);
  const workspaces = w && !workspaceIsEmpty(w) ? [w] : [];
  download(
    `fta-${carSlug(ordinal)}-${today()}.json`,
    file("car", { workspaces, setups: store.setupsOf(ordinal) }),
  );
}

export function exportSetup(store: GarageStore, id: string) {
  const s = store.setups.find((x) => x.id === id);
  if (!s) return;
  const slug = s.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  download(`fta-setup-${carSlug(s.ordinal)}-${slug}.json`, file("setup", { setups: [s] }));
}

export interface ImportResult {
  setupsAdded: number;
  setupsSkipped: number; // identical id+content already present
  setupsCopied: number; // id collision with different content -> copy
  workspacesAdopted: number; // local was empty -> taken as-is
  workspacesArchived: number; // local had data -> imported one became a setup
  workspacesSkipped: number; // imported one matches local (or an existing setup)
}

/** Parse + merge an export file. Throws with a readable message on bad input. */
export function importData(store: GarageStore, text: string): ImportResult {
  let parsed: ExportFile;
  try {
    parsed = JSON.parse(text) as ExportFile;
  } catch {
    throw new Error("Not a JSON file.");
  }
  if (parsed?.format !== "fta-export" || parsed.version !== 1 || typeof parsed.payload !== "object") {
    throw new Error("Not a Forza Tuning Advisor export file.");
  }

  const res: ImportResult = {
    setupsAdded: 0,
    setupsSkipped: 0,
    setupsCopied: 0,
    workspacesAdopted: 0,
    workspacesArchived: 0,
    workspacesSkipped: 0,
  };

  for (const raw of parsed.payload.setups ?? []) {
    if (!isSetupish(raw)) continue;
    const s = normalizeSetup(raw, parsed.exportedAt);
    const local = store.setups.find((x) => x.id === s.id);
    if (!local) {
      store.addSetup(s);
      res.setupsAdded++;
    } else if (JSON.stringify(local) === JSON.stringify(s)) {
      res.setupsSkipped++;
    } else {
      store.addSetup({ ...s, id: newId(), name: `${s.name} (imported)` });
      res.setupsCopied++;
    }
  }

  for (const raw of parsed.payload.workspaces ?? []) {
    if (!isWorkspaceish(raw)) continue;
    const w: Workspace = {
      ...raw,
      sessions: raw.sessions.map((s) => ({ ...s, discipline: normalizeDisciplineId(s.discipline) })),
    };
    const local = store.workspaces.get(w.ordinal);
    if (!local || workspaceIsEmpty(local)) {
      store.adoptWorkspace(w);
      res.workspacesAdopted++;
    } else if (sameContent(local, w) || store.setups.some((x) => sameContent(x, w))) {
      // Already present (re-import of a backup) — archiving again would just
      // pile up identical "Imported current" setups.
      res.workspacesSkipped++;
    } else {
      // Local current state wins; the imported one is preserved as a setup.
      const sum = summarize(mergeData(w.sessions.filter((s) => s.included).map((s) => s.data)));
      const setup: SavedSetup = {
        id: newId(),
        ordinal: w.ordinal,
        name: `Imported current (${new Date(parsed.exportedAt).toLocaleDateString()})`,
        savedAt: parsed.exportedAt || Date.now(),
        discipline: w.sessions[0]?.discipline ?? "road",
        build: w.build,
        tune: w.tune,
        sessions: w.sessions,
        m: sum ? metricsFrom(sum) : null,
      };
      store.addSetup(setup);
      res.workspacesArchived++;
    }
  }

  return res;
}

/** Same sheet + same session ids = the same data, wherever it lives. */
function sameContent(a: { ordinal: number; tune: object; sessions: { id: string }[] }, w: Workspace): boolean {
  return (
    a.ordinal === w.ordinal &&
    JSON.stringify(a.tune) === JSON.stringify(w.tune) &&
    a.sessions.length === w.sessions.length &&
    a.sessions.every((s, i) => s.id === w.sessions[i]?.id)
  );
}

/**
 * Imported setups can come from hand-edited files or pre-merge backups:
 * default a missing/invalid savedAt and map disciplines forward
 * (deterministically, so identical files still dedupe).
 */
function normalizeSetup(s: SavedSetup, exportedAt: number): SavedSetup {
  return {
    ...s,
    savedAt: typeof s.savedAt === "number" && Number.isFinite(s.savedAt) ? s.savedAt : exportedAt || 0,
    discipline: normalizeDisciplineId(s.discipline),
    sessions: s.sessions.map((x) => ({ ...x, discipline: normalizeDisciplineId(x.discipline) })),
  };
}

function isSetupish(s: unknown): s is SavedSetup {
  const x = s as SavedSetup;
  return (
    x != null &&
    typeof x.id === "string" &&
    typeof x.ordinal === "number" &&
    typeof x.name === "string" &&
    typeof x.tune === "object" &&
    Array.isArray(x.sessions)
  );
}

function isWorkspaceish(w: unknown): w is Workspace {
  const x = w as Workspace;
  return x != null && typeof x.ordinal === "number" && typeof x.tune === "object" && Array.isArray(x.sessions);
}

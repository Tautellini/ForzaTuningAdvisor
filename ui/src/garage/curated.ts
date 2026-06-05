// Loader for the repo-bundled curated setups (public/curated.json).
// Read-only: loading one into a car copies the sheet, never edits the entry.

import type { CuratedFile, CuratedSetup } from "./model";

let curated: CuratedSetup[] | null = null;
let loading: Promise<CuratedSetup[]> | null = null;

export function loadCurated(): Promise<CuratedSetup[]> {
  if (curated) return Promise.resolve(curated);
  if (!loading) {
    loading = fetch(`${import.meta.env.BASE_URL}curated.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`curated.json: HTTP ${r.status}`);
        return r.json() as Promise<CuratedFile>;
      })
      .then((f) => {
        curated = f?.format === "fta-curated" && Array.isArray(f.setups) ? f.setups : [];
        return curated;
      })
      .catch(() => {
        loading = null; // retry on next visit
        curated = null;
        return [];
      });
  }
  return loading;
}

export function curatedFor(ordinal: number): CuratedSetup[] {
  return (curated ?? []).filter((s) => s.ordinal === ordinal);
}

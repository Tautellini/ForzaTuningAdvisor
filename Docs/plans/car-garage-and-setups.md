# Car Garage & Tuning Setups

Spec from grill-me session, 2026-06-05. Feature request (user's words):

> "I would like to have a system where we can save Sessions (and Tuning Setups) for each ordinal car, and also be able to load each of this historic session data, or load a 'current' tune. We should be also able to curate a list of curated tuning setups based on session data that a user can optionally choose. There should be a car search and such things. Data should be saved locally only (browser storage?) but it should be exportable and importable."

## Goal

Turn the app from a single anonymous workspace into a per-car garage: identify the
car from `car.ordinal` (via `data/car_id_db.json`), show its real name in the Live
View, and scope sessions + tune sheets to that car. Setups are saved with their
session evidence, can be reloaded later, and a repo-bundled curated list offers
known-good setups per car. Everything stays local (IndexedDB) but exports/imports
as JSON files.

## Scope

**In (all v1 — user: "Everything is v1"):**
- Car identification + display in Live View (name, year/make/model, PI class, drivetrain)
- Per-ordinal workspaces: current tune + active session pool per car
- Save/load/archive Tuning Setups (sheet + raw sessions)
- Garage view: car search over the full DB, my-cars list, setup management
- Bundled curated setups list, loadable as a copy
- Export/import: full backup, per-car, single-setup share file
- Migration of existing localStorage data (`fta.sessions`, `fta.currentTune`)

**Out:**
- Any server/cloud sync — "Data should be saved locally only"
- In-app curation submission (sharing happens by sending the share file; curation is a repo PR)
- Editing curated entries in-app (they are read-only; loading creates a copy)

## User-facing behavior

### Car identity in Live View
- The car strip shows the resolved name (e.g. **2020 Toyota GR Supra**) with PI
  class + value and drivetrain chips. Detail metadata stays out of the way
  (tooltip/info-dot, per design guidelines).
- Unknown ordinal → "Unknown car (#1234)", everything still works.
- DB caveat: display names were auto-generated from asset names ("Verify
  weird/abbreviated models") — treat them as best-effort labels.

### Car switching (decided: **prompt before switching**, record in background)
- Telemetry recording is **keyed by the frame's own ordinal** — frames always
  record into the detected car's workspace immediately. Nothing is lost and
  nothing pollutes the previous car.
- The prompt only governs the **UI**: when a new ordinal appears, a banner asks
  "New car detected: <name> — switch view?". Confirming flips the displayed
  workspace; dismissing keeps viewing the old car (recording continues for the
  new one regardless).
- An ordinal change finalizes the in-flight session (a session never spans cars).

### Sessions & setups (decided: sessions belong to the active setup)
- Each car has an **active workspace**: current tune sheet + active session pool
  (today's behavior, but per-car).
- **Save setup** archives a snapshot: tune sheet + the raw `SessionData` of every
  session in the pool ("Tune sheet + raw sessions" — so the advice engine can
  re-analyze old setups later) + computed summary + discipline + build identity.
- After archiving, the active pool starts fresh.
- **Edit-after-driving prompt:** the first tune-sheet edit while the active pool
  has sessions asks "Archive current setup + sessions and start fresh?" — keeps
  pools honest without ceremony on every keystroke.
- **Load setup** copies its sheet into the car's current tune. Its archived
  sessions can also be loaded for inspection/advice replay.

### Build identity (decided: record + warn on mismatch)
- Setups store `{ pi, class, drivetrain }` at save time.
- Loading onto a different build still works but shows a warning chip:
  "saved at A 800 RWD — car is S1 900 AWD".

### Curated setups (decided: bundled with the app)
- A repo-maintained JSON ships with the app; entries per ordinal contain:
  tune sheet, summary metrics (the proof), discipline, author note.
- Shown as a separate read-only shelf on the car's garage page and surfaced when
  that car is detected.
- Loading a curated setup **copies** it into the car's current tune — the user
  owns the copy, curated stays pristine.
- Curation workflow: users export a single-setup share file → maintainer reviews
  and adds it to the curated JSON in the repo.

### Garage view (decided: top-level switcher, offline-capable)
- Header gains **Live | Garage** navigation. Garage works with no bridge
  connection — browse, search, inspect, import/export anytime. Live keeps its
  current connection gating.
- Garage home: searchable list over the **full** car DB (year/make/model/name),
  cars with saved data sorted first / badged. Selecting a car opens its page:
  current tune, archived setups, curated shelf, per-car export.

### Export / import
- **Full backup** — every car's workspaces + archived setups in one JSON.
- **Per-car export** — one car's data.
- **Single-setup share file** — sheet + evidence; doubles as the curated
  submission format.
- Import always **merges by id, never silently overwrites** — colliding ids with
  different content are imported as a copy (new id, "(imported)" label suffix).
  No replace-all mode.

## Architecture

- `ui/src/carDb.ts` — loads a slim car DB (ordinal → display_name, year, make,
  model) fetched as a static asset; the full scan JSON stays in `data/`. A small
  script (`scripts/build-car-db.mjs`) strips scan metadata
  (`asset`, `internal_path`, `zip_file`, `notes`, `source`, `confidence`)
  into `ui/public/cars.json` (~380KB → well under 100KB).
- `ui/src/garage/db.ts` — IndexedDB layer (db `fta`):
  - `workspaces` store, key `ordinal`: `{ ordinal, tune, activeSessions[], updatedAt }`
  - `setups` store, key `id`, index `ordinal`: archived setups
  - sessions stay embedded in their owning record (they're small; no separate store)
- `SessionStore` evolves to route frames by ordinal and to expose the *viewed*
  ordinal separately from the *recording* ordinal(s).
- Persistence is throttled: write on session finalize and explicit UI actions,
  never per frame.
- `ui/src/garage/` components: `GarageView`, `CarSearch`, `CarPage`,
  `SetupCard`, plus the switch-prompt banner in Live.
- Curated list: `ui/public/curated.json` (fetched at runtime; starts empty/minimal).
- Migration (one-time, on first load): old `fta.sessions` entries are grouped by
  their embedded `data.car.ordinal` into per-car workspaces; the global
  `fta.currentTune` attaches to the ordinal of the newest migrated session, or is
  held and adopted by the first detected car if no sessions exist. Old keys are
  removed after successful migration.

## Configuration

- Caps (decided: **IndexedDB, generous caps**): ~24 sessions per active pool
  (existing `CAP`), archived setups uncapped. Constants in code, not UI.
- Export format: `{ format: "fta-export", version: 1, kind: "full" | "car" | "setup", exportedAt, payload }`.

## Performance notes

- 60 Hz feed unchanged; per-frame work stays in-memory (`addFrame`).
- IndexedDB writes only on finalize/actions.
- Car search filters ~900 entries client-side — trivial; no index needed.

## Failure modes

- Ordinal not in DB → "Unknown car (#N)" fallback, full functionality.
- `cars.json` / `curated.json` fetch fails → Live still works, garage shows a
  non-blocking error state; retried on next visit.
- IndexedDB unavailable (private mode) → fall back to localStorage with the old
  tight caps and a visible notice.
- Corrupt import file → rejected with a clear message; nothing partially applied.
- Build mismatch on load → warning chip, not a block.

## Done criteria

1. Driving any car shows its real name/year/make/model + PI/drivetrain in Live View.
2. Switching cars in game prompts; confirming flips the workspace; telemetry was
   already recording to the new car either way.
3. Save setup → archived with sessions; tune edits after driving prompt to archive.
4. Garage: search any FH6 car, open it, see/load setups (historic + curated),
   with build-mismatch warnings.
5. Export full/per-car/setup files; import merges without data loss.
6. Existing users' localStorage data appears under the right cars after update.

## Open questions

- Initial content of `curated.json` (likely empty until first submissions).
- Exact visual placement of the car name in the car strip (resolved during
  implementation per MD3 design system: orange = interactive, sky = cool semantics).

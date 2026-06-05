# Unified Tune panel: merge Current tune + Tuning advice, add Apply

## Goal

User intent, verbatim: "I thought about an option to apply the advised tuning values, because as a player I do them ingame, to then update them in the current tune list. However, the more I thought about it, I wonder why we dont combine the 'current tune' values, and the tuning advice section in general. It can all be combined in one bracket, maybe even the cards can be combined."

Both panels already iterate the same `TUNE_GROUPS`, and `AdvicePanel` already renders every lever (amber advice card or green OkRow). Merging removes the duplicated structure, puts the value input where the advice lives, and enables one-click Apply of advised targets into the sheet.

## Scope

In:

- One merged section titled **"Tune"** replacing both `TunePanel` and `AdvicePanel`.
- Editable value input on every lever row, always visible (no edit mode, no click-to-edit).
- **Apply** button per amber card that has an absolute numeric target; one Apply for the whole gearing ratio set; a global **Apply all** in the section header.
- Step snapping of targets per field, consistent across recommendation text, viz, and applied value.
- Post-edit demotion: when the pool is fully stale, measured advice rows show a neutral "changed, drive to re-measure" state instead of fresh amber targets.
- Removal of the "Tune changed, archive the driven sessions?" dialog and its plumbing.

Out:

- `TuneSheet` (read-only sheet in `CarPage` / `SetupCard`) stays untouched.
- Curated setups, import/export, garage views: untouched.
- Writing values into the game is impossible (telemetry is one-way); Apply only updates the sheet.
- Archiving setups stays a manual action on the car page. The automatic archive prompt is removed, not replaced.
- No undo/snackbar for Apply. The input is right there; correcting is one edit.
- No per-group apply-all (decided against for v1).

## Decisions (from grilling, 2026-06-05)

| Question | Decision |
|---|---|
| Row anatomy | REVISED (user feedback after first build): inputs and cards are visually separated inside one group bracket. Each group has a compact entry grid on top whose fields plainly mean "type your current in-game values here"; advice/status cards render below a divider and never contain inputs |
| No-data rows | REVISED (same feedback): a green note only renders when something was verified, from telemetry with the same evidence gates the engine uses, or from the sheet itself (pressure/caster window checks). "No data yet" / "needs X" filler rows do not exist; Coverage owns the what-is-missing story |
| Apply semantics | Instant write, no dialog |
| Directional-only advice (no target) | No Apply button; the empty input on the row invites entry |
| TunePanel fate | Deleted entirely; car label, set-count chip, gears selector move into the merged section |
| Archive dialog | Killed everywhere (Apply and typed edits); stale handling is the only mechanism |
| Gearing apply | One Apply for the whole proposed ratio set |
| Rounding | Snap to per-field game steps, in display and on apply |
| Layout | Sticky bar, then Coverage, then the merged "Tune" section |
| Post-apply chasing | **Per-lever**: only the changed/applied levers are marked stale ("changed, drive to re-measure"); all other cards keep showing their proposals from the existing data, so a batch of changes can be applied off one drive |
| Apply all | Yes, global button in the section header |
| Invalidation | **Any** sheet edit marks the edited fields stale (and bumps `tuneEditedAt`), including filling a previously empty field |
| Old sessions | The next session start after a sheet edit **automatically drops** pre-edit sessions and clears the stale markers. No archive prompt, no banner asking the user to untick |

## User-facing behavior

Layout: sticky bar → Coverage → **Tune** section. No collapse on the section (it is the main content; `fta.tuneOpen` dies with TunePanel).

Section header: title "Tune", car label, set-count chip (count of entered fields), **Apply all** (rendered only when at least one card is applyable), info dot explaining the merged concept.

Groups render as today (`TUNE_GROUPS` ids, icons, titles, honest-caveat notes).

### Group anatomy (revised)

Each group bracket has two zones:

1. **Entry grid** on top: the editable number fields for every lever in the group (comma or dot decimals, unit suffix, in-progress decimal handling preserved). This zone is unmistakably "your current in-game values". Gearing's gears-count select sits in the group head; final drive and per-gear ratios are part of the grid.
2. **Card list** below a divider, rendered only when it has content:
   - **Amber cards**: advice targeting the group, with recommendation, viz, confidence chip, ⓘ why/outcome expander, and an **Apply** button labeled with the snapped target ("Apply 24"). All visible advice renders; a lever a card speaks for gets no extra status row.
   - **Green notes** (`leverNote()`): only when verified. Telemetry verdicts need the same evidence the engine rules need (e.g. "no lockup" needs real braking frames, ARB balance needs mid-corner time); pressure/caster verify the entered sheet against the discipline window and may show before driving. Anything unverified renders nothing.
   - **Stale notes**: "changed · drive to re-measure" for levers edited since the pool's data was driven.
   - **Directional-only advice** (no absolute target because the field is empty): card renders without Apply; the empty field above is the call to action.

A one-line hint under the section title explains the two zones once, instead of per-row chrome.

### Group cards (advice not bound to a single lever)

Render at the top of their group, above the lever rows, as today: shift-point reference (`gearing-shift-points`), ratio spacing (`gearing-spacing`), drag aero, aero balance cards, FWD entry-oversteer fallback, exit-understeer balance card.

- `gearing-spacing` gets a single **Apply** that writes all proposed ratios (`viz.ratioset.rows[].to`) into `gearRatios` at once.
- `balance-arb-stiff` spans both ARBs ("Front X / Rear Y → ~15–25 each"): Apply writes both fields when both are known, otherwise only the known one.
- Pure-directional group cards (drag-aero, aero-*) have no Apply.

### Gearing group

The gears-count `<select>` moves from TunePanel into the Gearing group head. Final drive + per-gear ratio inputs render as lever-style rows in the group. `gearing-limiter-top` keeps its own Apply (writes snapped `finalDrive`) separate from the spacing card.

### Apply / Apply all

Apply merges the card's targets into the tune and calls the normal tune-change path. Instant, no dialog. Because the sheet changed, `tuneEditedAt` bumps, the pool becomes stale, and the demotion below kicks in immediately: the applied card flips from amber to the neutral re-drive state on the next render. That is the feedback.

Apply all walks the advice list in engine order and merges every card's targets; on conflict the first card wins a field (consistent with the lever-row dedupe). One `setTune` call total.

### Staleness, per lever

- Any `setTune` diff (typed edit, clear, Apply, Apply all, gears-count change) adds the changed field keys to a per-workspace `staleFields` set and bumps `tuneEditedAt` as today.
- A lever row whose field is in `staleFields` shows a neutral stale state: the (new) value in the input plus "changed, drive to re-measure". Recomputed advice targeting that field is suppressed (this kills the apply-chasing loop: 28 → 24 applied does not immediately re-propose 24 → 21), and its measured status note is replaced too, since it describes the pre-change car.
- **Everything else keeps showing.** Other amber cards keep their proposals computed from the existing sessions; the user can apply several levers off one drive.
- Sheet-only checks (tire-pressure window, caster window, bump/rebound ratio) are never suppressed; they read only the sheet. Telemetry-based cards on a stale field (e.g. `tire-hot`) are suppressed.
- Gearing maps as one unit: a change to `finalDrive`, `numGears`, or `gearRatios` marks the gearing cards (spacing, limiter, shift-point reference) stale.

### Automatic session turnover

- When a new recording session **starts** (auto or manual) and `tuneEditedAt` is newer than existing sessions, every session of that car whose end time predates `tuneEditedAt` is dropped from the pool automatically, across disciplines (the tune is per-car; old sessions measured a car that no longer exists). `staleFields` clears at the same moment: everything remaining measures the current sheet.
- The stale-sessions banner is removed. While pre-edit sessions are still in the pool (edited but not yet driven), a single short line in the section header says the next drive starts a fresh pool.
- `applySetup` / `applyTune` (garage restore paths) already reset `tuneEditedAt`; they clear `staleFields` too.

### Empty states

- No viewed car: section not rendered (same condition as both panels today).
- Not enough data (`drivingFrames < MIN.frames`): keep the existing "advice firms up..." line; lever rows still render with inputs and "no data yet" notes, so the section doubles as the entry sheet from minute zero.

## Architecture

- **Component**: reshape `ui/src/components/AdvicePanel.tsx` into the merged panel (it already owns groups, cards, OkRow, Viz, leverStatus). Move `NumberField`, `parseNum`, gears-count handling over from `TunePanel.tsx`, then delete `TunePanel.tsx`. The component gains `onChange: (t: CurrentTune) => void`.
- **Engine** (`ui/src/advice/engine.ts`):
  - Add `apply?: Partial<CurrentTune>` to `Advice`. The engine fills it with **snapped** absolute targets whenever computable. This includes the cards whose target today lives only in recommendation text (`diff-center`, `drift-rotation-low`, `toe-front/rear`, `balance-understeer/oversteer`, `tire-hot`) and the multi-field cases (`balance-arb-stiff` both ARBs, `gearing-spacing` as `{ gearRatios }`, `gearing-limiter-top` as `{ finalDrive }`).
  - Add `sheetOnly?: boolean` on `Advice`, set by the rules that need no telemetry (`tire-pressure-*`, `caster-low`, `damping-bump-*`), so demotion can spare them.
  - Set `field` explicitly on every lever-bound card so `adviceField()` in the panel can be deleted (single source for the mapping).
  - Targets are snapped at emission time so recommendation text, viz numbers, and `apply` always agree.
- **Snapping** (implemented in the engine, not a table): every rule computes its target once into a const, game-step rounded (`r0` for ARB/diff/brake percents, `r1` for degrees/damping/springs/pressure-metric, `r2` for ratios), and reuses that value in `recommendation`, `viz`, and `apply`. Identity of read vs. applied value holds by construction; a separate per-field step table proved redundant.
- **App.tsx**: `handleTuneChange` becomes a direct `garage.setTune` call. Delete `pendingEdit` state and its `ConfirmDialog` block, and the `staleSessions` banner computation. Pass the workspace's `staleFields` and a `hasPreEditSessions` flag to the panel.
- **Store** (`ui/src/garage/store.ts`): `setTune` diffs old vs new tune and unions changed keys into `Workspace.staleFields`; session start drops pre-edit sessions (end time < `tuneEditedAt`) and clears `staleFields`; `applySetup`/`applyTune` clear `staleFields`. Remove `needsArchivePrompt` and `acknowledgeTuneEdit` (dead code under `noUnusedLocals`). Keep `tuneEditPrompted` in the persisted `Workspace` model as an unused optional field; `Workspace` is persisted verbatim and removing fields is a forward-compat hazard per project convention.
- **Model** (`ui/src/garage/model.ts`): `Workspace` gains optional `staleFields?: string[]`. Additive and optional, so existing stored workspaces load unchanged (`?? []` guards).
- **Advice id contract unchanged**: `groupForId()` and the `TUNE_GROUPS` id match remain the gate for rendering.

## Configuration

- Per-field `step` table in `tune.ts` is the only new tunable surface.
- No new persisted fields, no `DB_VERSION` change, no new localStorage keys. `fta.tuneOpen` becomes orphaned (harmless).

## Performance

Same render path as today. Typing already triggers `setTune` per keystroke with debounced persistence (`persistWorkspaceDebounced`) and a memoized advice recompute on `[computed, tune, profile, units]`. The merge adds no new per-frame work.

## Failure modes

- Apply on a sheet that diverges from in-game reality: user's responsibility, same as manual entry; staleness covers it after the fact.
- Apply-all conflicts on one field: first card in engine order wins, deterministic.
- Gearing apply length: `gearing-spacing` only fires from a complete entered ratio set, so the written array matches what exists.
- Clearing a field or changing `numGears` is a sheet edit and marks the field/group stale.
- Changing a field back to its old value while undriven still leaves it marked stale (no value-history tracking); cleared by the next drive anyway.
- A session spanning the edit (sheet changed mid-recording) ends after `tuneEditedAt`, so it survives the drop; its data is mixed. Same fuzziness the current stale formula has; accepted.
- Clock discipline (found in review): `RecordedSession.startedAt` used to carry the packet's game-uptime `TimestampMS`, which must never be compared against the epoch-ms `tuneEditedAt`; the drop predicate would have deleted every session. Sessions are now stamped with `Date.now()` at start (also fixing the session-strip time display); legacy uptime-stamped sessions compare as ancient and get dropped on the first post-edit drive, which the any-edit-invalidates rule covers.
- No sessions at all: nothing is stale to drop; sheet-only checks may fire pre-driving by design.
- Auto-drop after an accidental edit removes driven sessions without asking. Accepted trade-off of the no-dialog rule; sessions are regenerable by driving.

## Open questions (v2 candidates, explicitly not v1)

- Per-group apply-all.
- Visual flash/ack on freshly applied values.
- Distinguishing transcription (filling an empty field) from real changes so it does not mark the lever stale.

## Done criteria (user-selected)

1. Merged "Tune" section fully replaces both panels; `TunePanel.tsx` deleted; archive dialog and its store methods removed; `npm run build` (strict TS, noUnusedLocals) passes.
2. Every card that can compute an absolute target has a working, step-snapped Apply, including the gearing ratio set; global Apply all works.
3. Per-lever staleness works: an applied/edited lever shows "changed, drive to re-measure" while every other card keeps its proposal; sheet-only checks stay live; the next session start drops pre-edit sessions and clears the markers.
4. Verified live against the bridge: drive, receive advice, apply, value lands in the sheet, the applied card goes stale, others keep showing, re-drive starts a fresh pool.

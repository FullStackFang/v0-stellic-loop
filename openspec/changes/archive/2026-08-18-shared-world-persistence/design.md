## Context

`index.html` is a single ~4000-line in-browser React demo (JSX compiled by Babel at runtime, no build step, no backend, deployed as a static file on Vercel). It demos "Loop", an ownerless campus app: students drop intents and get seated into recurring study/social loops. Governance is by presence, not ownership (see PITCH.md "presence = authority").

Today the `App` component holds world state across many `useState` hooks (`loops`, `notifs`, `wrapped`, `feedback`, `myIntents`, plus `foldedIn`). `switchPersona` (index.html ~3897) reseeds the world via `seedLoops()` on every toggle and hardcodes asymmetric per-persona scripting. This makes cross-persona continuity impossible and bakes in a host/owner asymmetry the product explicitly rejects.

The primitives we need mostly already exist: `viewerId` is the spine of the app; every mutation (`foldIn`, `leaveLoop`, `checkIn`, `moveTonight`, `floorSeat`) is already written against `viewerId`; authorship metadata (`seededBy`, `seniority`) already confers no capability. A viewer-independent banding concept (`loopBand`/`BAND_BY_ID`) exists but hardcodes a Donlon-2F viewpoint and must become viewer-relative.

Constraints: no backend, no new dependencies, no build changes; keep changes surgical and within `index.html`; the `dana` advisor persona is out of scope.

## Goals / Non-Goals

**Goals:**
- One shared, persisted world; persona switching is viewpoint-only and never mutates the world.
- Cross-persona continuity: an action as one persona is reflected for others (subject to visibility) and survives reload.
- Identical UX across the three student personas; all role asymmetry removed.
- Attribute-driven visibility (dorm/floor/major/class/campus) with membership override.
- Preserve existing You-tab behavior (two-arg `saveIntent(it, replaceId)`, per-viewer "to rate"/segment default), now surviving toggles.
- Keep the live fold-in animation available via an explicit out-of-frame director control.

**Non-Goals:**
- No backend or server-written JSON files (browser can't reach them).
- No schema migrations (version-bump-and-reseed only).
- No reducer/Context/store library; no debounced saves; no cross-tab sync required.
- No course-catalog per student; a `major==='CS'` fallback covers class-scope for the demo.
- No change to `dana`, to campus aggregates (`buildCampus`/`COHORT`), or to the intent parser's course-code handling.

## Decisions

**1. Single `useState(world)` + helpers, not a reducer/Context.**
The app already threads a `state`/`actions` prop pair through one component tree; a reducer or Context buys nothing. A `setLoops` shim (`setWorld(w => ({...w, loops: fn(w.loops)}))`) lets existing mutation bodies stay byte-for-byte identical, minimizing risk. Alternative considered: `useReducer` — rejected as over-engineering for a demo.

**2. `localStorage` as the persistence medium.**
No backend exists, so server-side JSON files are unreachable. `localStorage` gives reload-durability with zero deps. A single `useEffect(() => worldStore.save(world), [world])` persists after any change; no per-call plumbing. Alternatives considered: in-memory only (loses reload durability — rejected as not "robust"); real backend (turns a static demo into a deployed app — out of scope).

**3. Version-gate + reseed instead of migrations.**
`world.version` compared against `WORLD_VERSION`; mismatch/corrupt/absent → fresh seed, wrapped in try/catch. For a throwaway demo, "stale blob ⇒ start fresh" is correct and guarantees a new deploy never boots broken. Alternative: migration code — rejected as unjustified complexity.

**4. Authorship as provenance, governance by presence.**
Record `createdBy`/`seededBy` but key no capability on them; keep the action set identical for all viewers; keep move/pin gated on `hereIds`. The only author-flavored UI (a "seeded it" label / seeded-loop banner) is symmetric recognition any author sees for their own loop — kept. This satisfies "no host/owner" by construction.

**5. Audience declaration + pure `isVisibleTo(loop, viewer)` with membership override.**
Each loop/intent carries `audience: { scope, ... }`; `isVisibleTo` switches on scope against viewer attributes; membership short-circuits to visible. An `inferAudience` shim derives audience for un-annotated seed loops so `BAND_BY_ID` can be retired incrementally. The feed pool becomes `visibleLoops(world, viewer)` and the scope dial derives labels from the viewer. Alternative: keep viewer-blind banding — rejected because it shows Josh a "Donlon" dial.

**6. Per-recipient notifications, per-user feedback.**
`world.notifs[userId]` and `world.feedback[userId]` replace single shared arrays. Fold-in/wrap events must name an explicit recipient — the one genuinely new decision (rather than mechanical move) in the refactor. This also makes ratings correctly private per persona.

**7. Live fold-in via explicit director control.**
Replace the implicit `'sunday-hw' && viewerId==='sarah'` trigger with an out-of-frame button performing one world mutation for a chosen (member, loop). Keeps the on-camera moment without hardcoding identities. Alternative: seed Maya as a member and drop the animation — viable but loses the live beat; director control chosen per product decision.

## Risks / Trade-offs

- **Magic strings `'sunday-hw'`/`'maya'`** appear in `armFoldIn`, the Maya seat, the Josh notif, and `BAND_BY_ID`. A stray one resurrects asymmetry. → Grep for both after refactor; relocate any remaining to seed data or the director control.
- **`loopBand` is viewer-blind.** Wrong scope semantics for Josh. → Make band viewer-relative or drop the dial in favor of `isVisibleTo` + existing `widenedTo` graceful-widening.
- **Notification recipient addressing** is a new concern. → Fold-in/wrap writers must set an explicit recipient `userId`; default to the loop's relevant member, not the current viewer.
- **Stale-closure toast reads** (e.g. `foldIn` reads `loops.find(...)` right after `setLoops`) read pre-update state today. → Behavior is unchanged under the world model; do not "fix" into post-update reads without re-checking toast copy.
- **`saveIntent(it, replaceId)`** two-arg contract from `IntentQuickAdd` must be honored (remove `replaceId` when the rebuilt intent gets a new id) so editing replaces rather than duplicates. → Implement explicitly; today the second arg is ignored.
- **`TheFloor`** keeps its own animated intents state. → Leave ephemeral; only its `onSaveIntent`/`onSeat`/`onUnseat` callbacks touch the world.
- **Shared `wrapped`** shows all past loops to every persona (current behavior). → Keep as-is; flag optional per-membership filter as a follow-up, not part of this change.

## Migration Plan

Single-file, incremental, add-before-remove:
1. Add `worldStore` + `seedWorld` + `WORLD_VERSION` above `App`; add `useState(worldStore.load)` and the save effect. Derive slices (`loops`, `myNotifs`, `feedback`, `myIntents`).
2. Repoint readers to slices; delete the collapsed `useState` hooks and `foldedIn`; add the `setLoops` shim.
3. Derive `user` from persona attrs; shrink `switchPersona` to viewpoint-only; delete all reseed/asymmetry blocks.
4. Rewrite mutations through the shim (bodies unchanged); make notif writers recipient-addressed; honor `saveIntent(it, replaceId)`.
5. De-script narrative beats: replace `armFoldIn` implicit trigger with the director control; fire `armWrap` once on first Home entry.
6. Add `audience` to seed loops (or rely on `inferAudience`), add `isVisibleTo`/`visibleLoops`, delete `BAND_BY_ID`, repoint the feed pool and dial; add `courses[]` to the three students.
7. Rewrite `reset` to `setWorld(worldStore.reset())` + clear ephemerals.
8. Verify in browser: create event as Sarah → drop → toggle to Josh (visibility + membership reflected); reload persists; no console errors.

Rollback: revert `index.html`; a stale `localStorage` blob is self-healing via the version gate, but clearing the `loop.world` key restores a clean seed.

## Open Questions

- Should Past (wrapped) loops be filtered to loops the persona was actually in? Deferred; current shared behavior kept unless requested.
- Should `viewerId`/`theme` be remembered across reloads via separate small keys? Optional; kept out of the world blob either way.

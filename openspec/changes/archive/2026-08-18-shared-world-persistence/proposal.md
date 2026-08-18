## Why

The `index.html` demo cycles between three student personas (Sarah, Josh, Maya) to tell the Loop story on camera, but today `switchPersona` **wipes and reseeds the whole world on every toggle** and **hardcodes asymmetric scripting per persona** (Maya is force-folded into a loop, Josh is treated as an RA with a waiting notification, Sarah gets a pre-dropped intent). This makes the demo brittle and contradicts the product's core premise: there is no host or owner — the three students should have identical UX and differ only by their attributes (dorm, major, courses). We want a robust demo where an action taken as one persona (create an event, drop it, rate a loop) persists and is reflected when you toggle to another persona, and survives a page reload.

## What Changes

- **BREAKING (demo behavior):** Replace the reset-on-toggle model with **one shared, persisted world object**. Switching personas only changes whose viewpoint renders; it never mutates the world.
- Introduce a **`localStorage` persistence layer** (`worldStore` with `load`/`save`/`reset`, version-gated reseed, lazy hydration, auto-save via a single effect). No backend, no new dependencies.
- **Collapse per-viewer React state** (`loops`, `notifs`, `wrapped`, `feedback`, `myIntents`) into the shared `world`; make `notifs` per-recipient and `feedback` per-user; delete `foldedIn`.
- **Strip all persona role asymmetry.** Remove Josh's RA tag / "seeded a loop" framing / waiting notification, Maya's forced fold-in, and Sarah's scripted suggestions. Authorship (`createdBy`/`seededBy`) becomes provenance metadata that confers **zero** capability; governance stays on presence (`checkIn`/`moveTonight`).
- **Add an attribute-driven visibility model.** Each loop/intent declares an `audience` (`campus` / `north` / `major` / `class` / `dorm` / `floor`); a pure `isVisibleTo(loop, viewer)` filter decides what each persona sees, with **membership always overriding scope**. Make the feed's scope dial viewer-relative; add `courses[]` to the three students.
- **Add an out-of-frame "director" control** next to the persona switcher that triggers a real fold-in world mutation on demand (replaces the hardcoded Sarah+Maya+`sunday-hw` animation).
- Preserve the existing **You tab** contracts exactly: the two-arg `saveIntent(it, replaceId)` edit-replace behavior and the per-viewer "to rate" / segment-default logic (now derived from per-viewer world slices, and now surviving toggles).

## Capabilities

### New Capabilities
- `shared-world-state`: A single serializable world object as the source of truth for loops, intents, memberships, per-recipient notifications, wrapped loops, and per-user private feedback — shared across all student personas, with a clear split between persisted world state and ephemeral session/view state.
- `world-persistence`: A `localStorage`-backed persistence layer that hydrates the seed world on first run, auto-saves on every mutation, version-gates against stale blobs (reseed, no migrations), and exposes a reset control.
- `persona-viewpoint`: Persona switching reduced to viewpoint-only (set `viewerId`, derive `user` from persona attributes, set landing screen) with all role asymmetry removed, plus an out-of-frame director control for on-demand world mutations (live fold-in).
- `audience-visibility`: An attribute-driven visibility model — audience declarations on loops/intents and a pure `isVisibleTo(loop, viewer)` filter (with membership override) that determines what each persona sees by dorm, floor, major, class, or campus.

### Modified Capabilities
<!-- No existing specs in openspec/specs/; nothing to modify. -->

## Impact

- **Single file:** all changes land in `index.html` (~4000 lines). Key regions: seed data (`USERS`, `seedLoops`, `PERSONAS`, `WRAPPED_LOOPS`), visibility helpers (`loopBand`/`BAND_BY_ID`), `PulseFeed`, `TheFloor`, `Home`, `LoopDetail`, `YouScreen`, `IntentQuickAdd`, and the `App` state + mutations + `switchPersona`/`reset`.
- **New runtime dependency on `localStorage`** (guarded by try/catch; graceful reseed on corrupt/stale/absent).
- **No external packages, no backend, no build-step changes.** Static Vercel hosting unaffected.
- **`dana` (advisor/staff) persona** is out of scope and unchanged.
- A companion mockup `mockups-you-hub.html` already exists and stays in the repo.

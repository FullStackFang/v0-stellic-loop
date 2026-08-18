# world-persistence Specification

## Purpose
TBD - created by archiving change shared-world-persistence. Update Purpose after archive.
## Requirements
### Requirement: localStorage persistence layer

The demo SHALL persist the shared world to `localStorage` through a small `worldStore` module exposing `load()`, `save(world)`, and `reset()`. `load()` SHALL return the seed world when storage is empty and SHALL be used as a lazy initializer so hydration runs once on mount. All storage access SHALL be wrapped in try/catch so a storage failure never crashes the app. No backend and no external dependency SHALL be introduced.

#### Scenario: Hydrate from storage on load

- **WHEN** the page loads and a valid saved world exists in `localStorage`
- **THEN** the app initializes its world from the saved blob rather than the seed

#### Scenario: Seed on first run

- **WHEN** the page loads and no saved world exists
- **THEN** the app initializes from the seed world

### Requirement: Automatic save on mutation

The world SHALL be saved to `localStorage` automatically whenever it changes, via a single effect that observes the world object. Individual mutations SHALL NOT call `save()` directly. Because every mutation produces a new immutable world object, the effect SHALL persist the latest world after any change.

#### Scenario: Change persists without per-call plumbing

- **WHEN** any mutation updates the world (create loop, join, leave, drop, rate, save/remove intent, check in, move)
- **THEN** the updated world is written to `localStorage` by the observing effect, and the change survives a page reload

### Requirement: Version-gated reseed instead of migration

The world SHALL carry an integer `version`. On `load()`, if the stored blob is absent, unparseable, or its `version` does not match the current `WORLD_VERSION`, the store SHALL silently return a fresh seed world. No migration code SHALL be written; a schema change SHALL be handled solely by bumping `WORLD_VERSION`.

#### Scenario: Stale blob does not crash a new build

- **WHEN** the page loads with a stored world whose `version` differs from the current build, or with a corrupt/unparseable blob
- **THEN** the app discards it and starts from a fresh seed world without error

### Requirement: Reset control

A reset action SHALL clear the persisted world and re-initialize from seed. Reset SHALL also clear ephemeral state, set the viewer back to the default persona, and return to the entry screen.

#### Scenario: Reset returns to a clean seeded demo

- **WHEN** the user triggers reset
- **THEN** the saved world is cleared, the world re-initializes from seed, ephemeral state is cleared, the viewer is the default persona, and the app is on the entry screen


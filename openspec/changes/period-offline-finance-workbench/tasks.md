## 1. Reference and architecture foundation

- [ ] 1.1 Review and approve design defaults: Windows-first standalone app, FCFF/end-year DCF, schema-driven artifacts, connector-first Claude Code/Codex runners without mandatory chat archives.
- [ ] 1.2 Create the isolated `apps/period/` project after approval; document exact npm/Tauri launch/build commands and prerequisites.
- [ ] 1.3 Inventory every website key/worksheet and capture real browser key traces; build the TI/website discrepancy ledger and choose behavior explicitly.
- [ ] 1.4 Evaluate maintained numerical/decimal/solver libraries against fixtures; document precision, domains and solver failure policies.
- [ ] 1.5 Define model/command/result/error/revision schemas and artifact registry boundaries; validate native capability scopes.

## 2. Calculator engine, staged but complete before parity release

- [ ] 2.1 Implement entry, modifiers, display/indicators, arithmetic CHAIN/AOS, errors and independent clear/reset state transitions.
- [ ] 2.2 Implement complete TVM solves, P/Y/C/Y and BEGIN/END, with zero/negative-rate and invalid-domain cases.
- [ ] 2.3 Implement amortization, signs, payment ranges and linked TVM timeline.
- [ ] 2.4 Implement cash-flow storage/frequencies/navigation/insert/delete and NPV/IRR with root ambiguity/non-convergence policy.
- [ ] 2.5 Implement Professional-style NFV, payback, discounted payback, modified IRR and bond duration with documented conventions.
- [ ] 2.6 Implement remaining bond, depreciation, statistics/regression, date, interest-conversion, percent-change, profit and break-even worksheets.
- [ ] 2.7 Complete scientific arithmetic, memory, constants, ANS, RAND, formatting and ON/OFF behavior.
- [ ] 2.8 Wire keyboard/click/accessibility/structured actions to the same engine and pass every matrix-family golden trace.

## 3. Deterministic DCF vertical slice

- [ ] 3.1 Implement versioned DCF model, units, horizon, fiscal-period-end valuation date validation, periods, scenarios, provenance and missing-value semantics.
- [ ] 3.2 Implement driver-based FCFF and direct-FCFF modes, annual overrides, NWC deltas and explicit cash-tax policy.
- [ ] 3.3 Implement CAPM/WACC, market/target weights, manual override and independent debt-tax-shield assumptions.
- [ ] 3.4 Implement perpetuity growth with normalized terminal FCFF and EV/EBITDA exit multiple as alternatives.
- [ ] 3.5 Implement year-end present values, enterprise/equity bridge, diluted share normalization and per-share results.
- [ ] 3.6 Pass the independent forecast/WACC/DCF fixtures and zero/negative/missing/nonfinite/unit-error tests.
- [ ] 3.7 Implement scenario clone/preview/apply/undo and sensitivity grids with explicit invalid cells.
- [ ] 3.8 Build forecast, WACC, terminal, valuation and audit views as one editable artifact; verify changes propagate atomically.

## 4. Artifact workspace and real chat

- [ ] 4.1 Rebuild the accepted three-pane design as production components; do not transplant accumulated prototype CSS as the app architecture.
- [ ] 4.2 Add stateful artifact tabs, registered table/chart/timeline/form/comparison components and linked model revisions.
- [ ] 4.3 Implement independent loan/savings models and calculator-linked timeline views according to their defined ownership, monthly conventions, zero-rate fixtures and persistence contract.
- [ ] 4.4 Implement typed read/compute/create/propose/apply/clone/sensitivity tool operations, command validation and idempotency.
- [ ] 4.5 Implement revision conflict handling, application-issued single-transaction edit authority, proposal diffs, undo/redo and serialized cancellation/commit boundaries; test wrong model, extra fields, replay and injected notes.
- [ ] 4.6 Add native Claude Code/Codex runner adapters, installation/auth detection, model choice, streaming, transient context or verified session resume, and failure/retry states. Verify installed-version protocols; no mandatory transcript archive.
- [ ] 4.7 Connect active artifact context and immutable result references to chat; verify the model uses engine tools for numerical answers.
- [ ] 4.8 Implement explicit artifact→calculator transfer previews with sign/unit/period conversion and undo.
- [ ] 4.9 Test natural-language DCF creation, missing assumptions, exact WACC edits, scenario proposals and explanation of changed valuation using real connected runners.
- [ ] 4.10 Implement the authenticated loopback API and thin MCP bridge, pin workspace identity, correlate requests to the authoritative command service, and test token rejection, rebind, timeout and desktop disconnect. Exclude tokens from model context/logs/exports.

## 5. Local durability and distribution

- [ ] 5.1 Implement transactional local persistence, schema migrations, recovery and restart restoration for all model/workspace state.
- [ ] 5.2 Implement validated versioned JSON exchange and CSV financial exports; verify scale/roundtrip behavior and secret exclusion.
- [ ] 5.3 Bundle all local assets and verify first launch, calculator/DCF editing, save and restart with network disabled.
- [ ] 5.4 Build and smoke-test the Windows installer and exact documented npm/Tauri workflows on a clean supported environment.

## 6. Release verification

- [ ] 6.1 Run numerical/regression/property tests and audit complete key-by-key parity coverage, including discrepancy decisions.
- [ ] 6.2 Verify 1280×720, 1440×900 and 1920×1080 layouts, minimum window/reflow, 200% zoom, keyboard navigation, focus and reduced motion in a real rendered browser/native webview.
- [ ] 6.3 Exercise long conversation/large forecast scrolling, artifact creation, stale chat edits, cancelled streams and duplicate tool calls.
- [ ] 6.4 Verify actual Claude Code and Codex streaming/tool-call flows plus an external MCP client; test missing runner/auth, restart/resume or explicit new session, isolation, disconnect, workspace pinning and no silent failover.
- [ ] 6.5 Confirm every exposed production control is implemented, no sample reply is presented as live AI, and no data depends on the source website.
- [ ] 6.6 Publish a verification report separating measured results, reference discrepancies and unexecuted checks. Do not mark release-ready while a required gate is incomplete.

The stages may be developed incrementally; finishing the TVM/DCF slice alone does not complete calculator parity. These are proposed tasks, not checked-off implementation work.

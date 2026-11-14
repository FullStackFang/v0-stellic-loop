## Why

The user wants an ad-free, offline desktop financial calculator with behavior almost identical to baiiplus.com, plus a persistent chat assistant and an interactive artifact canvas. The existing Period mockup establishes the visual direction but is not a production calculator: it has a fixed annuity example, scripted chat, disabled keys, and no Tauri packaging. Extending that mockup as though it were complete would preserve the wrong architecture and numerical limitations.

The application must also support a complete discounted-cash-flow valuation: forecast free cash flow, derive WACC, calculate terminal value, discount to enterprise value, and bridge to equity value and value per share.

## What Changes

- Build a separate Windows-first Tauri application with a bundled React/TypeScript frontend and local, deterministic financial engines.
- Implement all calculator key families and worksheets shown in the agreed parity matrix, with key-by-key behavior tests and documented website/TI discrepancies.
- Keep the accepted three-pane design: narrower calculator, interactive artifact canvas, always-visible chat.
- Add editable DCF artifacts with forecast tables, WACC construction, two terminal methods, valuation bridge, scenarios, and sensitivities.
- Replace canned chat with Claude Code/Codex runner adapters and a thin MCP/local API connector for financial tools. Keep active chat context without requiring a durable transcript archive. Financial calculation and saved artifacts remain usable without internet or a runner.
- Persist workspaces locally; allow versioned JSON exchange and auditable CSV exports.

## Capabilities

### New Capabilities

- `calculator-parity`: Offline calculator state machine, worksheets, precision, errors, and parity fixtures.
- `dcf-valuation`: FCFF forecast, WACC, terminal value, enterprise/equity valuation, scenarios, sensitivities, auditability.
- `artifact-workspace`: Persistent canvas and chat, typed artifact rendering, revision-aware model edits and explicit calculator transfer.
- `offline-desktop`: Desktop launch/build, local persistence, runner connections, offline operation and packaging.

### Modified Capabilities

None. The existing Stellic Loop application is not part of this change.

## Impact

Proposed implementation boundary: `apps/period/`, with its own package scripts and `src-tauri/`. This location is a design default, not an existing application. The current prototype under `work/calculator-mockup/` remains a visual reference only. No production code, provider installation, deployment, repository migration, or dependency changes are authorized by this proposal alone.

Canonical architecture and defaults are in [design.md](design.md), normative acceptance requirements in [specs](specs), and work sequencing in [tasks.md](tasks.md). Status: draft for user review. The OpenSpec CLI was unavailable in this environment; the package uses the spec-driven file structure but has not passed CLI validation.

# Period: offline calculator, DCF, and conversational artifacts

Date: 2026-11-08. Status: proposed design for review, not a completed application.

## 1. Intent and confirmed requirements

Build an ad-free desktop application launched through npm/Tauri, similar in operation to the user's LLM Wiki desktop setup. The calculator must operate almost identically to baiiplus.com, not like the fixed example in the mockup. Core financial work must function offline. Users can visualize TVM, perform a complete DCF valuation, and converse with a Claude- or ChatGPT-like assistant about the active data and calculations.

The visual direction is approved in conversation: Apple-inspired silver surfaces, graphite calculator with physical depth, restrained motion, a narrower calculator on the left, an interactive artifact canvas in the center, and chat always visible on the right. At normal desktop sizes it should fit the window. Chat must be able to create/open an artifact, change it through follow-up instructions, and discuss its actual current inputs and results. The canvas is not just a text answer or static chart.

## 2. Proposed defaults and scope boundaries

These are design decisions made to make the request buildable, not additional requirements claimed to have come from the user:

| Decision | Proposed first release |
|---|---|
| Platform | Windows first, Tauri 2 with React/TypeScript/Vite; macOS/Linux follow after native verification |
| Location | Separate `apps/period/` project; do not repurpose Stellic Loop routes or its databases |
| Valuation | Unlevered FCFF discounted at WACC, producing enterprise value; explicit equity bridge |
| Forecast | Annual periods, 5 forecast years by default, editable from 1 through 20 |
| Timing | Valuation at year 0; full-year, end-of-year forecasts; terminal value at the end of final forecast year |
| Rates | Constant nominal annual WACC over the modeled horizon; no automatic market-data fetching |
| Terminal methods | Perpetuity growth or exit EV/EBITDA multiple, selectable alternatives |
| AI | Connector-first: installed Claude Code or Codex runner feeding the persistent chat pane; MCP exposes Period tools to external assistants |
| Artifacts | Schema-driven interactive financial tools, not arbitrary generated JavaScript execution |
| Storage | Local SQLite via narrow native commands, versioned JSON backup/import, CSV export |
| Units | One user-selected currency and scale per model; no implicit currency conversion |

Deferred: arbitrary code artifacts, autonomous web research/data extraction, local LLM serving, multi-user collaboration, live quotes, cloud sync, tax-loss carryforward schedules, financial-institution FCFE models, APV, acquisitions/LBO modeling, quarterly/stub periods, mid-year discounting, and time-varying WACC. Deferred items must be absent or explicitly unavailable, never silently approximated by the annual model. Windows installation and the complete agreed calculator matrix are release requirements, even if implementation is phased.

## 3. Calculator parity contract

The reference hierarchy is: (1) specified user-visible website workflow, (2) TI-documented financial and arithmetic behavior, (3) an explicit discrepancy decision where they disagree. The website acknowledges incomplete functionality; it is not an unquestioned numerical oracle. No claim of binary-identical TI firmware or official affiliation is intended. Implement original code and original assets; do not assume the website's source is licensed for reuse.

| Family | Required behavior before parity release |
|---|---|
| Input and control | Digits, decimal, sign, backspace, entry clear, 2ND, CPT, ENTER/SET, QUIT, arrows, insert/delete, reset, calculator ON/OFF with a defined recovery path |
| Arithmetic | CHAIN/AOS, parentheses, percent, power/root, reciprocal, logarithm/exponential, trig/inverse/hyperbolic, factorial, nPr/nCr, constant, ANS, RAND |
| TVM | Enter/recall/solve N, I/Y, PV, PMT, FV; P/Y, C/Y; BEGIN/END; clear TVM; sign conventions and amortization P1/P2, BAL/PRN/INT |
| Cash flows | CF0 and grouped flows with frequencies; navigation and insert/delete; NPV/IRR and visible Professional-style NFV, PB, DPB, modified IRR outputs |
| Additional worksheets | Bond pricing/yield/accrual/duration; depreciation; DATA/STAT/regressions; percent change; interest conversion; dates; profit; break-even; M0–M9 storage |
| Settings | Precision display, angle units, date format, separators and calculation method; persist locally |

Calculator state is an explicit reducer/state machine: registers, current entry, operation stack, selected worksheet/field, 2ND mode, compute/edit mode, pending operation, indicators, settings and error state. The keypad, keyboard bindings, accessibility actions and approved chat actions must all dispatch the same semantic commands. No DOM-driven numerical state or duplicate chat math.

Display rounding is not storage rounding. Internal numeric representation and solver strategy are selected after evaluating existing libraries against the reference corpus. Prefer maintained numerical/decimal libraries where they satisfy requirements; avoid writing a generalized expression engine or root solver without that evaluation. Precision, error and non-convergence behavior are public contracts independent of library choice.

Golden traces record the state after every key: display, indicators, register changes, field focus and error. The matrix includes clearing one worksheet without disturbing another, formatting without changing stored values, and persistence across restart. Test monthly payments with a different compounding frequency. A solver must report no solution, non-convergence or ambiguity rather than invent a zero or unqualified root. Multiple-IRR handling and capacity limits follow a documented reference decision.

References: [Baiiplus](https://baiiplus.com/), [TI BA II Plus guide](https://education.ti.com/download/en/ed-tech/ADF11FB65B284B6195B0A7E9502784BA/5DC3E70F3C8040E499D704B583646E1D/BA_II_PLUS_EN.pdf), [TI Professional guide](https://education.ti.com/download/en/ed-tech/6D4382031E7640378E9B05B81AECBCF7/8A3EF44EF00C4C41A0D14411EA589D1F/BAIIPLUSPROGuidebook_EN.pdf). Live website keystroke parity has not yet been executed; capture it during implementation, not retroactively claimed by this document.

## 4. DCF model and calculation contract

### 4.1 Model identity and units

A DCF model has stable ID, schema version, revision, company/project label, valuation date, currency, unit scale, base year, forecast horizon, source annotations, scenarios and selected scenario. Historical/base-year columns are visually separated from forecast years. Monetary inputs share the model's scale; shares have a separately labeled count scale and are normalized before per-share division. A model cannot silently combine millions of currency with unscaled shares.

Valuation date SHALL equal the explicit base fiscal-period end. Forecast dates are successive annual fiscal-period ends, with discount exponents 1 through N; February 29 rolls to the last day of February in non-leap years. Mid-period valuation dates are rejected with an explanation that stub periods are unsupported, rather than silently discounted as full years. As-of dates on source inputs do not change cash-flow timing.

Every editable assumption identifies whether it was entered manually, imported, or proposed through chat, including source/note and last edit. External data is never presumed current. Inputs show their as-of date when provided. Unknown values remain missing, not zero.

### 4.2 Project free cash flow

Two explicit modes:

1. **Operating forecast:** enter base revenue and base non-cash operating NWC; supply per-year growth, EBIT margin, cash-tax assumptions, D&A, capex and working-capital assumptions. Percentage-of-revenue drivers and direct amount overrides are supported for D&A, capex and operating NWC. An override is visibly marked and remains until reset.
2. **Direct FCFF:** enter annual cash flows, positive or negative. Driver-derived rows are not shown as if known. Switching modes creates a new scenario or requires an explicit preview; it never silently destroys the prior forecast.

For each forecast year t:

```text
Revenue[t] = Revenue[t-1] × (1 + revenueGrowth[t])
EBIT[t] = Revenue[t] × ebitMargin[t]
CashTaxes[t] = max(EBIT[t], 0) × taxRate[t]   [default policy]
NOPAT[t] = EBIT[t] − CashTaxes[t]
ΔNWC[t] = OperatingNWC[t] − OperatingNWC[t-1]
FCFF[t] = NOPAT[t] + D&A[t] − Capex[t] − ΔNWC[t]
```

Capex is entered as a positive cash outlay; depreciation is a non-cash addback; an increase in NWC uses cash. Working capital excludes financing debt and excess cash. Interest expense and debt repayment are not subtracted from FCFF. Cash taxes may be directly overridden with an explanation; negative EBIT does not automatically produce a cash refund. No NOL engine is implied. Negative FCFF is valid.

The forecast table exposes every row, formula, unit, override and dependency. Editing a driver immediately updates downstream results and the active artifact. It is possible to inspect the values that produced any result without asking the assistant.

### 4.3 WACC

Provide a manual WACC mode and a calculated mode; switching makes the source visible. Calculated mode uses:

```text
CostOfEquity = RiskFreeRate + LeveredBeta × EquityRiskPremium
AfterTaxCostOfDebt = PreTaxCostOfDebt × (1 − DebtTaxShieldRate)
WACC = EquityWeight × CostOfEquity + DebtWeight × AfterTaxCostOfDebt
```

Input market equity/debt values to derive weights, or directly enter target weights that sum to 100%. Zero debt is valid. Do not infer capital structure from the model's unknown output valuation and introduce a circular formula. Operating cash tax rates and the debt-tax-shield rate are separate, labeled assumptions. First release excludes preferred equity from the WACC capital structure; preferred claims, if applicable, can still be handled explicitly in the equity bridge. Risk-free rate, premium and pre-tax debt cost must match the model's currency/rate basis; currency mismatch is a user-visible validation concern.

### 4.4 Terminal value

**Perpetuity growth:** `TV[N] = NormalizedFCFF[N+1] / (WACC − g)` with a labeled default `NormalizedFCFF[N+1] = FCFF[N] × (1 + g)`. Allow an explicit terminal FCFF override and show it as an assumption. The default extrapolation is a shortcut, not a claim that the final forecast's reinvestment economics are sustainable. Surface terminal reinvestment/normalization notes and terminal share of enterprise value. WACC must exceed g; g must exceed −100%; non-positive normalized terminal FCFF cannot produce a perpetuity value in this release and requires another method or a longer forecast.

**Exit multiple:** `TV[N] = NormalizedEBITDA[N] × ExitEVEBITDAMultiple`. In operating mode, default EBITDA is EBIT plus D&A; allow a labeled override. Direct-FCFF mode requires terminal EBITDA explicitly. Require positive EBITDA and multiple; do not derive EBITDA from FCFF. The exit is at the end of year N, not N+1.

The two terminal methods are alternatives, not values added together. Changing methods retains their separate inputs so comparisons are reversible.

### 4.5 Present value and equity bridge

```text
PVForecast = Σ[t=1..N] FCFF[t] / (1 + WACC)^t
PVTerminal = TV[N] / (1 + WACC)^N
EnterpriseValue = PVForecast + PVTerminal
EquityValue = EnterpriseValue + ExcessCash + NonOperatingAssets
              − Debt − PreferredClaims − NonControllingInterest + OtherAdjustments
ValuePerShare = EquityValue / DilutedSharesOutstanding
```

Discount year N's explicit FCFF and terminal value once each. Neither historical year-zero cash flow nor acquisition price is part of enterprise value by default. Explicit inputs for excess cash, debt and claims prevent silent omissions; zero must be intentionally represented. Missing bridge inputs suppress equity/per-share results but preserve a valid enterprise value. A blank model leaves bridge assumptions unconfirmed; a sample may contain explicitly labeled zeros. Missing diluted shares suppress per-share output while preserving EV/equity. Zero/negative shares are invalid. Negative equity values are displayed, not clamped.

Show the yearly discount factors, PV of each FCFF, terminal value at N, PV terminal, terminal percentage, enterprise value, every bridge adjustment and per-share calculation. Result metadata captures model revision, assumptions and formula version.

### 4.6 Scenarios and sensitivities

Base/bull/bear are independent named scenarios; cloning copies assumptions and provenance, with edits thereafter isolated. A 2D sensitivity view varies WACC and g for perpetuity models, or WACC and exit multiple for exit models. Invalid cells are marked, not coerced. Clicking a cell previews a scenario; it does not mutate the baseline. Applying it records one undoable revision. A missing input invalidates dependent outputs and never leaves an unlabeled stale valuation visible.

DCF formulas and additional sourced notes are documented in [sources.md](sources.md). Numeric fixture expectations belong in the normative DCF spec and must be implemented as automated tests.

## 5. Three-pane workspace and artifacts

Desktop acceptance viewports: 1280×720, 1440×900 and 1920×1080 at 100% scale. Persistent calculator, canvas and chat; no whole-window vertical or horizontal scrolling at these sizes with the default artifact open. Tables/conversation can scroll inside their panes. Minimum usable desktop window is 1100×680; below that, reflow instead of clipping controls. Test 200% zoom with reflow rather than promising all panes side by side. Chat is never automatically dismissed. Provide user-controlled pane widths within sensible bounds.

Canvas tabs include calculator-linked TVM and cash-flow timelines, DCF valuations, WACC builders, comparison/sensitivity views, loan explorers and savings projections. Each artifact has ID, kind, title, schema version, model ID, model revision, view settings and unsaved status. Opening a second artifact preserves the first. Reopening a saved workspace restores tabs, inputs and calculator state. Chat continuity follows the connector contract below, without requiring a duplicate conversation archive.

Calculator timelines are editable views of the calculator's existing state, not independent copies. DCF, loan and savings artifacts have independent model IDs. Editing a calculator-linked timeline dispatches calculator commands; editing an independent model does not change calculator registers.

Minimum utility-artifact scope: loan explorer models a fully amortizing fixed-rate loan with nonnegative principal, nominal annual rate 0–100%, and an integer term of 1–360 monthly end-of-period payments. Let r=annualRate/12; payment is `principal*r/(1-(1+r)^(-months))`, or `principal/months` at zero rate. Show monthly payment, total paid/interest, balance chart and monthly principal/interest/balance schedule. No fees, prepayments, variable rates or balloon balance in this initial utility. Savings projection accepts nonnegative initial balance and monthly contribution, nominal annual rate 0–100%, and 1–50 integer years, with monthly compounding and month-end contributions. At m months use `initial*(1+r)^m + contribution*((1+r)^m-1)/r`, with the zero-rate limit `initial+contribution*m`. Show final balance, total contributed, growth and balance history. Values retain full internal precision. A future expansion of these utilities does not imply a restriction on the full BA II calculator's documented domains.

Artifacts are rendered from validated data specifications using a registered component library. The assistant can compose supported views (table, timeline, chart, assumption form, scenario comparison) and create new model instances, not merely select a fixed canned response. This provides the artifact experience without evaluating arbitrary model-generated JavaScript inside the privileged desktop app. Unsupported artifact types return an actionable message; they are not rendered as fake working tools.

Default DCF layout: steps or tabs for Forecast, WACC, Terminal and Valuation; a shared assumptions strip; editable table or chart as the main region; an inspectable formula/result drawer. Chat can open the DCF, populate a draft, propose a scenario or highlight a formula. Direct editing and chat use the same model commands. Intentional light/shadow and motion follow the approved mockup, with reduced-motion alternatives and no looping decorative animation.

## 6. Chat, tool use and model mutation

Two separate connections are required. A runner adapter sends user messages to an installed Claude Code or Codex process and streams responses into the always-visible pane. A thin MCP server exposes Period's typed financial commands through an authenticated loopback API. MCP alone is not an embedded chat interface. External assistant clients may use those tools independently of the pane. See the source review in [llm-wiki-review.md](llm-wiki-review.md).

The first release targets Claude Code and Codex CLI adapters, using their existing supported sign-in flows; it does not embed the ChatGPT website or promise consumer subscription/API equivalence. Direct Anthropic/OpenAI API adapters are deferred. Before implementation, verify the installed runner versions and supported streaming, tool and session protocols. Each adapter must demonstrate real Period tool calls; a text-completion bridge alone does not meet the artifact requirement. Both adapters are first-release acceptance requirements. If either cannot provide the required restricted tool transport, report its gate blocked and resolve it before declaring the full release complete; do not silently drop the adapter or substitute a mock.

Keep active-turn messages/tool results in memory as needed for follow-ups. Prefer runner-owned session/resume where supported; persist only the opaque session reference and connector settings, not a mandatory second transcript database. If resume is unavailable, start a clearly labeled new conversation with the selected model snapshot; do not pretend to remember old messages. Durable chat search, archives and transcript export are out of scope. The model's prose is never a calculation authority.

Required operations: list/open artifacts; inspect active model and calculator state; compute a model; create a draft DCF; propose changes; apply an authorized change; clone a scenario; open a sensitivity view; explain a formula using returned inputs/results; prepare an explicit transfer into calculator registers. Requests carry model ID, expected revision and tool-call ID. Reject duplicate mutations and stale revisions; ask the model to reread changed state. Cap tool-loop length and expose cancellation.

Reading/computing/opening views needs no confirmation within the paired workspace. Mutation authority is issued by Period, never asserted by the model. An explicit user command such as “set WACC to 9%” may authorize the exact change only when trusted application code binds the user action to model, scenario, expected revision, field/value and one transaction. Include the manual-mode switch in that scope. If this cannot be established deterministically, show the proposed diff for Apply. Suggestions and multi-field rewrites require Apply. IDs, revisions and tool-call IDs establish routing/concurrency/idempotency, not permission. Reject extra fields, another model/scenario and authorization replay; notes/imported instructions cannot issue authority.

Cancellation stops future tool work and discards uncommitted drafts. The command service serializes cancellation against commit: if cancellation wins, no write occurs; if commit wins, that edit remains and is undoable. Already committed changes are not rolled back automatically, particularly across later UI edits. Late responses from a cancelled run cannot mutate state. Edits arriving from the UI while a response streams cannot be overwritten by stale tool calls. Undo creates a new revision and recomputes.

Show which artifact and revision the assistant is discussing. Numeric explanations attach structured result references; retain the snapshot for historical messages and mark it when newer model revisions exist. Do not update old prose's numbers silently. Missing source data is requested or represented as a visible assumption, not invented as a company fact.

The native host launches only configured, validated runner executables with structured arguments, bounded output and cancellation; no model-controlled shell strings. Runner credentials remain runner-owned. Show the selected runner/model and attached financial context before sending. Remote inference needs connectivity even though the subprocess is local. No automatic provider failover. Connection failure preserves drafts and local financial work. Restrict runner tools to the Period connection and isolate unrelated filesystem/shell tools; verify that restriction for each supported runner instead of assuming an MCP allowlist alone disables other tools.

The local API binds loopback only and requires a random pairing token, held by the native host/connector and excluded from logs, exports and model context. Pin each connector session to a workspace; switching desktop tabs/workspaces does not retarget an in-flight request. Explicit rebind requires a user action. MCP and native UI commands enter the same authoritative command service; neither connector may write SQLite directly or duplicate financial formulas. While the desktop is closed, tools report unavailable. External clients default to proposal/Apply for edits unless Period has issued the exact scoped authority above.

## 7. Architecture and offline persistence

`apps/period/` contains the isolated frontend, TypeScript financial domain package and Rust Tauri host. Public npm commands from that directory: `npm install`, `npm run tauri -- dev`, `npm run tauri -- build`, with `"tauri": "tauri"` as the package script. Add `desktop:dev` and `desktop:build` aliases if useful; document the exact tested launch convention in the eventual README.

Layers:

1. Pure financial engines: calculator state reducer and financial primitives, DCF graph evaluation, validations, typed results/errors. No network, UI imports, storage or model prompts.
2. Command service: revisions, validation, transaction boundaries, undo/redo and structured audit events. Both chat and UI enter here.
3. Artifact registry/UI: registered renderers, model subscriptions, editable assumptions and chart/table projections.
4. Tauri backend: constrained persistence, file import/export, runner lifecycle, authenticated local API and MCP bridge. Restrict capabilities to specific app windows and commands; remote content receives no native privileges. See [Tauri capabilities](https://v2.tauri.app/security/capabilities/). The TypeScript command service remains the single model authority; route local API requests to it through correlated native IPC while the app runs, with timeout/disconnect errors and no second Rust model cache.

Store calculator state, model/scenario revisions, artifacts, numerical result snapshots, connector/session references, preferences and schema migrations in local SQLite. No mandatory persisted chat transcript. Use transactional writes; debounce UI persistence without losing committed commands. Atomic export/import, explicit version compatibility, pre-migration backup, and a recoverable corrupt-file path are required. Recompute cached results on schema/formula upgrades and label version changes. Financial results must not depend on an online backend, hosted font, CDN asset, provider account or the original website being reachable.

First-run empty state offers a labeled sample DCF and a blank model. Samples are fictional and removable. JSON exports include assumptions/provenance/revisions but exclude secrets and runner session references; CSV exports include currency/scale, timing, scenario, assumptions, result rows and a formula legend. Artifacts retain state across restart; starting a new chat does not delete models or undo history.

## 8. Verification and release gates

Treat the existing mockup tests as interaction evidence only, not proof of calculator parity or DCF validity. Release requires: an audited parity ledger with no unimplemented claimed key; independent numeric fixtures; real browser layout/keyboard/accessibility checks; native Windows launch/build/install smoke checks; loss-of-network and restart tests; and an actual authenticated streaming/tool-call smoke test with each supported runner and the external MCP connector. The browser automation host was unavailable during mockup review, so no rendered-layout verification is inherited.

Use absolute/relative tolerances with expected display strings, precise input units, and published fixture metadata. DCF money checks use 0.01 model-currency-unit display tolerance and internal relative tolerance 1e-9 on finite values, with tighter zero-case absolute checks; document any justified tolerance adjustment. Solver-specific precision/error decisions require their own fixtures. Do not test an implementation by calculating its expected results with the same implementation.

Implementation is phased in [tasks.md](tasks.md), but a phase is not the complete product. The final parity release includes DCF, real artifacts/chat, persistence and packaged offline operation. Spec approval does not assert that the current mockup already meets these gates.

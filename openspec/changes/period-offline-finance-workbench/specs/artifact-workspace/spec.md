## ADDED Requirements

### Requirement: Persistent calculator, canvas and conversation
The application SHALL retain three visible panes at the specified desktop acceptance sizes, with narrower calculator, primary canvas and persistent chat. Pane-specific scrolling SHALL preserve access to calculator and chat composer. It SHALL support keyboard navigation, visible focus, reduced motion and reflow at zoom/narrow widths.

#### Scenario: Large DCF table and long chat
- **GIVEN** a 20-year model and a long conversation at 1280×720
- **WHEN** the user scrolls the forecast or conversation
- **THEN** the calculator and composer remain accessible and no page-wide horizontal scrolling is required.

### Requirement: Real interactive artifact creation
Chat SHALL be able to create and open validated financial artifact instances using the artifact registry. Inputs, tables, charts and outputs SHALL be live, retain state when switching tabs, and reference the same domain model used by direct editing. The production assistant SHALL NOT be implemented as keyword-triggered canned replies.

#### Scenario: Create and revise a DCF from conversation
- **WHEN** the user requests a five-year DCF using supplied assumptions
- **THEN** the assistant creates an editable draft artifact, identifies missing data and explicit assumptions, and opens it in the canvas
- **AND** subsequent authorized changes update that artifact rather than emitting a disconnected replacement.

### Requirement: Deterministic numerical ownership
Financial values shown in an artifact or presented as computed results in chat SHALL come from domain-engine tools, with model ID, revision, assumptions and formula version. Generated text SHALL not become a stored valuation result merely by appearing in a response.

#### Scenario: Explain terminal value
- **WHEN** the user asks why terminal value changed
- **THEN** the assistant reads the relevant result snapshots and identifies changed inputs and calculated effects, with inspectable references.

### Requirement: Defined utility artifact models
Loan and savings artifacts SHALL implement the independent monthly models defined in design.md, expose their assumptions and retain their input state across tabs/restart. Calculator-linked timelines SHALL instead reference the calculator state and dispatch calculator commands, without a second independent set of registers.

#### Scenario: Zero-interest loan
- **GIVEN** loan principal 12,000, nominal annual interest 0% and 12 monthly payments
- **WHEN** the loan artifact is calculated
- **THEN** monthly payment is 1,000, total interest is zero and the final balance is zero, without changing calculator registers.

#### Scenario: Zero-interest savings
- **GIVEN** initial balance 1,000, monthly month-end contribution 100, nominal annual rate 0% and one year
- **WHEN** the savings artifact is calculated
- **THEN** final balance and contributions are 2,200 and growth is zero.

#### Scenario: Edit a calculator-linked timeline
- **WHEN** the user changes payment timing in the calculator's timeline
- **THEN** the calculator receives the timing command and both displays reflect the same updated registers and revision.

### Requirement: Shared, explicit mutation semantics
Direct input changes and chat-authorized edits SHALL use the same validation/command service. Mutation authority SHALL be application-issued, bound to the exact model/scenario, revision, fields/values and one transaction. A model claim of user permission SHALL NOT grant authority. Explicit single-field instructions may authorize the named edit only through that trusted binding; otherwise a diff SHALL require Apply. Inferred assumptions and multi-field rewrites SHALL require Apply. Each accepted model edit SHALL be undoable and revisioned.

#### Scenario: Explicit WACC change
- **WHEN** the user says “set WACC to 9%” on the active DCF
- **THEN** the application binds authority to that model/scenario and manual-mode/9% change, or presents the exact diff for Apply if it cannot establish the binding
- **AND** an authorized commit records the prior mode/value and creates an undoable revision.

#### Scenario: Model expands or replays authority
- **GIVEN** authority for one WACC change on model A
- **WHEN** a tool targets model B, adds an unapproved growth edit, reuses consumed authority for a new transaction, or cites instructions in an imported note
- **THEN** no unauthorized edit occurs; an exact duplicate request may only return its prior outcome.

#### Scenario: Cancellation races a commit
- **WHEN** cancellation occurs before, during or after an edit transaction
- **THEN** the command service serializes cancellation against commit; cancellation before commit prevents the write, while a completed commit remains undoable
- **AND** future and late operations from the cancelled run are rejected without reverting later UI edits.

#### Scenario: Stale model response
- **GIVEN** chat read revision 8 and the user has edited the model to revision 9
- **WHEN** a tool requests mutation using expected revision 8
- **THEN** the command is rejected as stale without overwriting revision 9; the assistant can reread and propose a new change.

#### Scenario: Duplicate tool delivery
- **WHEN** the same mutation tool-call ID is delivered twice
- **THEN** the second delivery returns the prior outcome without applying the mutation twice.

### Requirement: Safe artifact renderer boundary
The application SHALL render versioned artifact schemas using trusted local components. Unknown types or invalid schemas SHALL return errors. Model-supplied executable JavaScript, native commands or filesystem paths SHALL not be executed merely because they appear in chat or artifact content.

#### Scenario: Unsupported generated artifact
- **WHEN** a response requests an unregistered artifact type or executable script
- **THEN** the system rejects it and offers supported forms without accessing native capabilities.

### Requirement: Explicit transfer into calculator
Artifacts SHALL not silently overwrite calculator state. A transfer SHALL preview field mapping, signs, scale and rate basis, preserve a calculator snapshot for undo, and respect calculator capacity and worksheet semantics.

#### Scenario: Load DCF flows into CF worksheet
- **WHEN** the user chooses Load into calculator
- **THEN** the preview distinguishes explicit annual FCFF, terminal addition at period N, CF0 convention and discount rate
- **AND** only Apply loads the mapped values, with a recorded previous calculator state.

### Requirement: Recoverable remote chat
The assistant SHALL expose streaming, cancellation, connection failure, invalid tool output and retry states. Provider failure SHALL not disable local artifacts or discard unsent text. Model context SHALL identify the active artifact and distinguish historical result snapshots from current values.

#### Scenario: Network loss mid-response
- **WHEN** connectivity fails during a streamed response
- **THEN** the UI identifies the incomplete response, preserves completed local transactions and drafts, and permits offline calculator/DCF editing without pretending chat succeeded.

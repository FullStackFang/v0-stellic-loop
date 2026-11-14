## ADDED Requirements

### Requirement: Complete offline calculator behavior
The system SHALL implement all key and worksheet families in the design's parity matrix using a deterministic state engine. Every displayed calculator key SHALL perform its labeled function or its documented modifier action in the parity release. A prototype with disabled function keys SHALL NOT satisfy this requirement.

#### Scenario: Working calculator without a network
- **GIVEN** a fresh local workspace and no network connection
- **WHEN** the user enters valid arithmetic, TVM, CF, memory and worksheet operations
- **THEN** the application calculates and retains the results without loading the source website or contacting a provider.

### Requirement: Reference hierarchy and discrepancy ledger
The implementation SHALL preserve the reference website's interaction conventions while using the TI guides for numerical behavior. Every discovered conflict SHALL record the reference inputs, observed website state, documented TI behavior, chosen result and rationale. It SHALL NOT silently copy a numerical defect to claim parity.

#### Scenario: Reference site differs from documented arithmetic
- **WHEN** the site and documented reference give different outcomes for a captured sequence
- **THEN** the test corpus retains both observations and marks the explicit product decision before the feature is considered verified.

### Requirement: Stateful entry and independent registers
The engine SHALL distinguish entry clear, worksheet clear, TVM clear and reset; entered and computed values; current display formatting and internal values; and pending modifiers. Independent worksheets SHALL not overwrite one another as a side effect of navigation.

#### Scenario: Recover from division by zero
- **WHEN** the user enters `1 ÷ 0 =` and then `CE/C`
- **THEN** the calculator first displays the documented error, then accepts another calculation without losing unrelated TVM or cash-flow values.

#### Scenario: Stored memory survives restart
- **WHEN** the user performs `42 STO 3`, clears entry, restarts the application and recalls M3
- **THEN** M3 returns 42 with the selected display format.

### Requirement: CHAIN and AOS calculation modes
The system SHALL follow the selected calculation mode and persist it.

#### Scenario: Operator precedence differs by mode
- **WHEN** `2 + 3 × 4 =` is entered with two-decimal display
- **THEN** CHAIN returns `20.00` and AOS returns `14.00`.

### Requirement: Full TVM solve and frequency semantics
The system SHALL allow input, recall and solving of N, I/Y, PV, PMT and FV, and correctly interpret P/Y, C/Y and BEGIN/END. It SHALL expose numerical or domain failures as calculator errors.

#### Scenario: Single-period growth
- **GIVEN** END, P/Y=C/Y=1, cleared TVM, N=1, I/Y=10, PV=−100 and PMT=0
- **WHEN** the user presses CPT then FV
- **THEN** FV displays 110.00.

#### Scenario: Payment timing changes the timeline
- **GIVEN** P/Y=C/Y=1, N=1, I/Y=10, PV=0 and PMT=−100
- **WHEN** FV is computed in END then BEGIN
- **THEN** results are 100.00 then 110.00 and the linked timeline moves the payment from t=1 to t=0.

#### Scenario: Zero interest is supported
- **GIVEN** END, P/Y=C/Y=1, N=10, I/Y=0, PV=0 and PMT=−100
- **WHEN** FV is computed
- **THEN** FV is 1,000.00 without division-by-zero or solver failure.

### Requirement: Cash-flow worksheets and difficult roots
The system SHALL support grouped cash-flow frequencies, editing, insert/delete, NPV/IRR and the agreed additional outputs. Multiple roots, invalid input and non-convergence SHALL be distinguished from a valid zero result according to the documented policy.

#### Scenario: One outflow and one inflow
- **GIVEN** CF0=−100, C01=110, F01=1 and discount interest 10% per period
- **WHEN** NPV and IRR are calculated
- **THEN** NPV is 0.00 and IRR is 10.00%.

#### Scenario: More than one IRR can exist
- **GIVEN** flows −100, 230, −132 at t=0,1,2
- **WHEN** IRR is requested
- **THEN** the interface does not present a selected 10% or 20% root as uniquely determined; the solver/reference policy and ambiguity are visible.

### Requirement: Equivalent interaction paths
Click, keyboard and authorized structured commands SHALL enter the same state transitions. Chat SHALL not bypass calculator semantics or mutate registers through hidden UI-specific shortcuts.

#### Scenario: Structured action matches a key trace
- **GIVEN** identical initial engine snapshots
- **WHEN** the same authorized value/worksheet operations are entered by clicks and by structured commands
- **THEN** resulting register values, display indicators and errors are equivalent.

### Requirement: Auditable parity coverage
Each matrix family SHALL have at least normal, boundary and invalid-input traces, plus persistence/clear tests where applicable. Each golden trace SHALL include intermediate state, not just the final number. All documented supported keys and worksheets SHALL have coverage before release.

#### Scenario: No hidden implementation gaps at release
- **WHEN** the parity suite and coverage manifest are reviewed
- **THEN** each displayed label maps to an implemented state transition and a verified test; missing implementation blocks the parity release.

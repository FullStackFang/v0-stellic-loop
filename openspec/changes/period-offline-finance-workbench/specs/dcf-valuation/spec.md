## ADDED Requirements

### Requirement: Independent, revisioned FCFF valuation model
The system SHALL implement DCF as a separate model with currency, unit scale, base year, valuation date, annual timing, horizon, scenario and revision. It SHALL use FCFF/WACC to produce enterprise value, not mix FCFE with WACC, and not inherit calculator P/Y, C/Y or BEGIN settings.

#### Scenario: Calculator settings do not change DCF timing
- **GIVEN** an annual end-year DCF and a calculator set to monthly BEGIN payments
- **WHEN** calculator frequency or timing changes
- **THEN** the DCF retains its own annual end-year timing and valuation unless the DCF itself is explicitly edited.

### Requirement: Explicit annual valuation dates
The valuation date SHALL equal the base fiscal-period end. Forecast cash flows SHALL occur on successive annual fiscal-period ends with discount exponents 1 through N. February 29 SHALL map to the last day of February in non-leap years. Mid-period dates SHALL be rejected while stub-period valuation is unsupported.

#### Scenario: Fiscal-year-end dates
- **GIVEN** a base fiscal-period end and valuation date of 2026-06-30
- **WHEN** a five-year forecast is created
- **THEN** forecast dates are June 30 of 2027 through 2031 with discount exponents 1 through 5.

#### Scenario: Unsupported mid-period valuation
- **GIVEN** a base fiscal-period end of 2026-06-30
- **WHEN** valuation date is changed to 2026-09-30
- **THEN** validation rejects the mismatch and explains the unsupported stub period instead of showing a full-year-discounted valuation as valid.

### Requirement: Operating-driver and direct-FCFF forecasts
The system SHALL provide an editable 1–20-year forecast, defaulting to five years, with operating-driver and direct-FCFF modes. It SHALL preserve both input sets, label the active mode, show direct overrides, and calculate FCFF using the formulas and tax policy in design.md.

#### Scenario: Operating forecast fixture
- **GIVEN** base revenue 1,000; base operating NWC 100; growth 10%; EBIT margin 20%; taxes 25%; D&A/revenue 3%; capex/revenue 5%; NWC/revenue 10% for five years
- **WHEN** the forecast is evaluated
- **THEN** year-one revenue=1,100; EBIT=220; cash taxes=55; D&A=33; capex=55; ΔNWC=10; FCFF=133
- **AND** years 1–5 FCFF are 133; 146.3; 160.93; 177.023; 194.7253, without intermediate rounding.

#### Scenario: Loss-year tax treatment
- **GIVEN** negative EBIT and the default no-immediate-loss-benefit policy
- **WHEN** taxes are calculated
- **THEN** cash taxes are zero unless explicitly overridden, and the tax policy is shown.

#### Scenario: Working-capital release and negative cash flow
- **WHEN** operating NWC falls or forecast FCFF is negative
- **THEN** the reduction in NWC increases FCFF and negative cash flows remain valid signed inputs.

### Requirement: Auditable WACC construction
The system SHALL support manual WACC and CAPM/after-tax-debt construction with entered market values or target weights. It SHALL require finite inputs, nonnegative weights, positive total capital and a tax-shield rate from 0 through 100%. Target weights SHALL sum to 100% within a documented input tolerance. WACC SHALL be greater than −100% for discounting.

#### Scenario: WACC fixture
- **GIVEN** risk-free rate 4%, beta 1.2, ERP 5%, pretax debt cost 6%, debt-tax-shield rate 25%, equity weight 80%, debt weight 20%
- **WHEN** WACC is calculated
- **THEN** cost of equity is 10%, after-tax cost of debt is 4.5%, and WACC is 8.9%.

#### Scenario: All-equity capital structure
- **GIVEN** debt weight 0 and equity weight 100%
- **WHEN** WACC is calculated
- **THEN** WACC equals cost of equity; a meaningless debt-cost input is not required.

### Requirement: Explicit terminal-method semantics
The system SHALL support perpetuity-growth and exit EV/EBITDA methods as alternatives, retain both input sets and discount the chosen terminal value from year N. Perpetuity SHALL require WACC>g, g>−100% and positive normalized next-year FCFF. Exit multiple SHALL require positive terminal EBITDA and multiple. Missing derived EBITDA in direct-FCFF mode SHALL require an explicit EBITDA assumption.

#### Scenario: Perpetuity fixture
- **GIVEN** year-five FCFF 140, g=2.5% and WACC=8.9%
- **WHEN** the default extrapolation is used
- **THEN** normalized year-six FCFF is 143.5 and terminal value at year five is 2,242.1875.

#### Scenario: Exit multiple replaces perpetuity
- **GIVEN** terminal EBITDA 200 and exit multiple 10
- **WHEN** exit-multiple mode is selected
- **THEN** terminal value at year N is 2,000 and the perpetuity value is not added to it.

#### Scenario: Invalid or near-singular terminal inputs
- **WHEN** WACC is equal to or below g
- **THEN** the valuation shows an actionable validation error and suppresses dependent current outputs
- **AND** a positive WACC−g gap smaller than 0.5 percentage points shows a sensitivity warning without silently changing inputs.

### Requirement: Enterprise and equity valuation bridge
The system SHALL show explicit-flow PV, terminal PV, operating enterprise value, signed bridge adjustments and optional value per diluted share. Excess cash and debt SHALL not also be subtracted as net debt. Missing shares SHALL suppress only per-share output; nonpositive shares SHALL show validation.

#### Scenario: Complete valuation fixture
- **GIVEN** annual end-year FCFF `[100,110,120,130,140]`, WACC=8.9%, g=2.5%, excess cash=50, debt=200, nonoperating assets=0, preferred claims=0, noncontrolling interest=0, other adjustments=0 and diluted shares=100, all in consistent units
- **WHEN** the perpetuity DCF is calculated
- **THEN** the following values match within the specified numerical tolerance:

| Result | Expected unrounded value |
|---|---:|
| PV forecast FCFF | 461.342748374220 |
| Terminal value at year 5 | 2,242.187500000000 |
| PV terminal | 1,463.971183708070 |
| Operating enterprise value | 1,925.313932082290 |
| Common equity value | 1,775.313932082290 |
| Value per share | 17.753139320823 |
| PV terminal / enterprise value | 76.0380506946593% |

#### Scenario: Negative equity is retained
- **WHEN** debt and other claims exceed enterprise value plus nonoperating assets
- **THEN** equity is displayed as negative rather than zero or blank.

#### Scenario: Missing equity-bridge input
- **GIVEN** a valid operating enterprise value but an unconfirmed debt, cash, asset or claim input
- **WHEN** the valuation is displayed
- **THEN** enterprise value remains available while equity and per-share results are marked incomplete, with the missing assumption identified instead of assumed zero.

### Requirement: Explicit validation and non-stale results
The system SHALL reject nonfinite values and missing required inputs, use declared units and suppress or visibly mark stale downstream results after invalid edits. It SHALL not silently replace unknown values with zero. Currency/scale mismatch SHALL block the affected calculation. Terminal dominance above 80% of positive EV SHALL display a warning; percentages with nonpositive EV SHALL be labeled not meaningful.

#### Scenario: Incomplete forecast
- **WHEN** one required FCFF is emptied
- **THEN** dependent PV/valuation is invalid until corrected; the last valid result may remain only with a clear stale label and revision.

### Requirement: Scenarios, sensitivity and result inspection
The system SHALL support cloning/naming scenarios, WACC×g or WACC×multiple grids, immutable baseline preview and explicit application with undo. Every result SHALL expose its formula, input references, units and revision, and can be attached to chat.

#### Scenario: Invalid sensitivity cell
- **WHEN** a sensitivity cell has WACC≤g
- **THEN** it contains the reason for invalidity rather than zero, infinity or a copied neighboring result.

#### Scenario: Scenario preview does not change base assumptions
- **WHEN** a user selects a sensitivity cell or asks chat for a higher-WACC case
- **THEN** the base model remains unchanged until Apply, and undo restores the prior values through a new revision.

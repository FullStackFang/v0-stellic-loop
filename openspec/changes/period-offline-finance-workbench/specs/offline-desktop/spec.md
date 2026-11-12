## ADDED Requirements

### Requirement: Isolated launchable desktop application
The application SHALL be a separate Tauri desktop project with documented npm development and build commands, bundled local assets, and a tested Windows installer. It SHALL not modify or depend on the Stellic Loop production services.

#### Scenario: Launch from a clean supported environment
- **GIVEN** documented Windows prerequisites and installed dependencies
- **WHEN** the documented npm/Tauri development command is run
- **THEN** the desktop application opens with its calculator, canvas and chat panel.

#### Scenario: Packaged offline use
- **GIVEN** the installed build and disabled network
- **WHEN** the user launches, calculates, saves and restarts
- **THEN** financial functions and saved work remain usable with no CDN, website or provider dependency.

### Requirement: Durable and recoverable local state
The system SHALL persist calculator registers/settings, model revisions, scenarios, artifact tabs and connector/session references locally, without requiring stored conversation transcripts, using schema-versioned transactional storage. It SHALL handle interrupted writes and upgrades without silently losing valid prior data.

#### Scenario: Restart after editing
- **WHEN** a user edits a DCF, switches artifacts and restarts
- **THEN** the saved assumptions, selected artifact and calculator state are restored and results recomputed consistently.

#### Scenario: Unsupported import schema
- **WHEN** an imported file uses an unsupported schema or invalid financial data
- **THEN** import stops with actionable errors before changing the existing workspace.

### Requirement: Auditable export and unit preservation
The application SHALL support versioned JSON model/workspace exchange and CSV financial exports. Exports SHALL declare currency, amount/share scales, scenario, timing, model/formula revision, inputs and results, and SHALL exclude provider secrets.

#### Scenario: Export and restore a model in millions
- **WHEN** a model using currency millions and separately scaled diluted shares is exported and reimported
- **THEN** enterprise, equity and per-share values remain numerically equivalent with the same explicit units.

### Requirement: Explicit runner connection and session ownership
The application SHALL offer verified Claude Code and Codex runner connections with model selection and explicit context attachment. Authentication SHALL remain runner-owned; secrets SHALL stay outside renderers, documents, model context and logs. Active chat context MAY be held in memory. Restart SHALL resume a supported runner session or clearly start a new conversation attached to current model state. Remote requests SHALL not occur merely by opening the calculator or loading a model.

#### Scenario: No credentials configured
- **WHEN** the application launches with no provider configured
- **THEN** the calculator, DCF and artifacts are fully functional and chat displays a connection action instead of fake assistant replies.

#### Scenario: Provider outage
- **WHEN** the selected provider fails
- **THEN** the application shows the error and does not send model data to a different provider without the user's choice.

### Requirement: Native access remains constrained
The desktop host SHALL expose narrow validated commands for persistence, imports/exports and fixed runner lifecycle operations. Runner tool access SHALL be restricted to the Period connection, with no arbitrary shell/filesystem tools available to generated instructions. Untrusted file/chat content SHALL not gain arbitrary filesystem, shell or credential access.

#### Scenario: Embedded instructions in imported data
- **WHEN** an imported model note contains instructions to run a shell command or disclose credentials
- **THEN** it remains data and cannot create such an operation.

### Requirement: Evidence-based production readiness
Release SHALL include real browser layout/accessibility tests, native Windows install/restart/offline smoke tests, calculator parity evidence, DCF fixtures and real tool-calling smoke tests with each supported runner and an external MCP client. Any unexecuted gate SHALL be explicitly reported as incomplete.

#### Scenario: DOM tests pass but no native test ran
- **WHEN** only jsdom tests have passed
- **THEN** desktop packaging, rendered layout and real-provider integration are not labeled verified.

#### Scenario: One required runner fails verification
- **WHEN** either Claude Code or Codex fails tool-call or isolation verification
- **THEN** the full first-release gate remains incomplete; both adapters are required and unsupported status does not waive the failing gate.

### Requirement: Authenticated workspace-bound connector
The application SHALL expose typed financial tools through a thin MCP bridge over an authenticated loopback API. Each connection SHALL remain pinned to a user-selected workspace. Both connector and UI SHALL use the same command service and numerical engine; the bridge SHALL NOT write storage directly. Pairing tokens SHALL be excluded from model context, logs and exports. External mutation calls SHALL require application-issued scoped authority or a proposal accepted in Period.

#### Scenario: Desktop switches workspace during a request
- **GIVEN** a connector pinned to workspace A
- **WHEN** the desktop opens workspace B while a request is running
- **THEN** the request still targets A; switching the connector requires explicit user rebind.

#### Scenario: Missing authentication or closed desktop
- **WHEN** a request lacks a valid pairing token or the desktop is unavailable
- **THEN** it returns authentication or connection failure without executing any financial command.

#### Scenario: Restart without resumable chat
- **WHEN** the workspace restarts and its runner cannot resume the previous session
- **THEN** models, artifacts and undo history are restored and the pane clearly starts a new conversation with selected model context, without invented conversational memory.

## ADDED Requirements

### Requirement: One read of what is waiting across a member's groups
The connector SHALL offer a read-only tool that takes no group and returns what is waiting for the calling member across every group the calling assistant holds a grant for: open asks the member has not answered, events the member has not acted on, records that mention the member, and current announcements not yet shown to the member. It SHALL return at most 10 items, asks closing soonest first, and SHALL say how many more are waiting in which groups. It SHALL return nothing from a group the assistant has no grant for.

#### Scenario: Two things waiting
- **WHEN** a member with one unanswered ask and one new event calls the tool
- **THEN** the reply states "2 things from your groups", names each with its group, date or closing time, and says how to act on each

#### Scenario: Nothing waiting
- **WHEN** a member with nothing waiting calls the tool
- **THEN** the reply is one short line saying nothing is waiting

#### Scenario: Ungranted group stays out
- **WHEN** a member belongs to two groups and the calling assistant holds a grant for one
- **THEN** only items from the granted group are returned, and the other group is not mentioned

### Requirement: An item waits until the member acts on it
An item SHALL remain waiting for a member until that member acts on it or dismisses it. An ask SHALL wait until the member answers it or it closes. An event SHALL wait until the member marks interest, declines it, or it ends. A mention or announcement SHALL wait until it has been returned to that member once. Waiting state SHALL be kept per member, and one member's actions SHALL NOT change what waits for another.

#### Scenario: Still waiting tomorrow
- **WHEN** a member is shown an unanswered ask today and calls the tool again tomorrow without answering
- **THEN** the ask is returned again

#### Scenario: Acting clears it
- **WHEN** a member marks interest in a waiting event
- **THEN** the event is no longer returned as waiting for that member, and still is for others who have not acted

#### Scenario: Declining an event
- **WHEN** a member says an event is not for them
- **THEN** it stops waiting for that member and they are not listed as interested

### Requirement: Assistants are told to check once per conversation
The connector's server instructions and the tool's description SHALL tell the assistant to call the waiting tool once at the start of a new conversation before answering, to show the result briefly, to continue with the user's actual request, and not to call it again in that conversation unless the user asks. The wording SHALL be short and kept in one place so it can be changed and re-tested.

#### Scenario: Instruction is delivered
- **WHEN** an assistant connects to the team endpoint
- **THEN** the server instructions it receives contain the check-once wording

### Requirement: Results carry an in-chat card where the assistant supports one
The waiting, events, ask and results tools SHALL attach an in-chat interface using the standard keys and standard bridge of the MCP in-chat interface extension. Every result SHALL also carry a complete plain-text form and a structured form, so an assistant with no card support gives a usable answer. The card SHALL show nothing that the text form does not state.

#### Scenario: Assistant with card support
- **WHEN** an assistant that supports in-chat interfaces calls the waiting tool
- **THEN** it can render a card listing the waiting items with a control on each

#### Scenario: Assistant without card support
- **WHEN** an assistant with no card support calls the same tool
- **THEN** it receives the same items as plain text and can act on them by calling tools

### Requirement: One card works in every supported assistant
The card SHALL depend on no interface that only one assistant provides. A feature only one assistant offers SHALL be detected at run time and SHALL degrade cleanly when absent. Compatibility aliases for a particular assistant SHALL be added only where that assistant's current documentation requires them.

#### Scenario: Same card in two assistants
- **WHEN** the card is rendered in Claude and in ChatGPT from the same deployment
- **THEN** both show the waiting items and both can record an answer, with no code path that fails when a host-specific object is missing

### Requirement: Card actions use the same tools and checks as the model
The answer and interest tools SHALL be callable by the model and by the card. A card button SHALL go through the same grant, role, cap and closing checks as a model call. After a write the card SHALL update in place to show the new counts and the member's own state. The card SHALL NOT be able to call any tool the assistant could not call.

#### Scenario: Tapping "I'm in"
- **WHEN** a member taps the interest control on an event in the card
- **THEN** their interest is recorded, the control shows their new state, and the count rises by one without a new message being needed

#### Scenario: Answering by text instead
- **WHEN** a member types "mark me as in for the mixer" and the assistant calls the interest tool
- **THEN** the same state is recorded as a tap would record

#### Scenario: Closed ask tapped
- **WHEN** a member taps an option on an ask that closed after the card was drawn
- **THEN** nothing is saved and the card says the ask has closed

### Requirement: The card is self-contained, themed and compact
The card SHALL be a single page with scripts and styles inline that loads nothing from outside Loop. It SHALL escape member-written text and show it as text. It SHALL follow the host's light or dark theme and host-provided style values. It SHALL have a loading state, an error state that invites a retry, and an empty state. It SHALL be compact enough to sit above the assistant's answer.

#### Scenario: Dark theme
- **WHEN** the host reports a dark theme
- **THEN** the card's text and controls remain readable with no fixed light-only colours

#### Scenario: Loop unreachable
- **WHEN** a card action cannot reach Loop
- **THEN** the card shows "Couldn't reach Loop. Try again" and changes nothing

#### Scenario: Member text is not markup
- **WHEN** an ask's question contains HTML tags
- **THEN** the card shows them as literal characters

### Requirement: Current documentation is read before the card is built
Before card code is written, the current specification and SDK documentation of the in-chat interface extension, and each supported assistant's current documentation for it, SHALL be read and summarised in a notes file in this change. Where the design conflicts with those documents the documents SHALL be followed and the conflict recorded. Behaviour that differs between assistants SHALL be recorded in a compatibility note.

#### Scenario: A documented difference
- **WHEN** testing shows a card behaviour that differs between two assistants
- **THEN** the compatibility note records the difference and how the card handles it

## ADDED Requirements

### Requirement: Persona switching is viewpoint-only

Switching between the three student personas SHALL only change whose viewpoint renders. It SHALL set `viewerId`, derive `user` from the persona's fixed attributes (with optional profile/onboarding overrides), reset ephemeral view state, and set the landing screen. Switching SHALL NOT reseed, wipe, or otherwise mutate the shared world.

#### Scenario: Toggling personas preserves the world

- **WHEN** the viewer switches from one student persona to another
- **THEN** all loops, memberships, intents, wrapped loops, and feedback in the world are unchanged, and only the rendered viewpoint (and ephemeral view state) changes

#### Scenario: Action by one persona is visible to another

- **WHEN** a persona creates an event and then leaves it, and the viewer toggles to another persona for whom that event is visible
- **THEN** the second persona sees the same event with the updated membership reflecting the first persona's actions

### Requirement: No persona role asymmetry

All three student personas SHALL have identical capabilities and UX. The demo SHALL NOT special-case any persona with a distinct role, tag, forced membership, scripted suggestion set, or waiting notification. Specifically, the RA tag / "seeded a loop" framing and waiting notification for Josh, the forced fold-in for Maya, and the pre-dropped scripted suggestions for Sarah SHALL be removed. Personas SHALL differ only by their attributes (dorm, major, courses, year).

#### Scenario: Personas differ only by attributes

- **WHEN** comparing the three student personas
- **THEN** they expose the same actions and the same UX, and any difference in what they see or land on is attributable solely to their attributes, not to a role

### Requirement: Out-of-frame director control for live fold-in

The demo SHALL provide an out-of-frame control (adjacent to the persona switcher) that performs a single real world mutation to fold a chosen person into a chosen loop on demand, so the live fold-in animation can be shown on camera without hardcoding it to a specific persona, target, or loop.

#### Scenario: Director triggers a real fold-in

- **WHEN** the operator activates the director fold-in control
- **THEN** the chosen member is added to the chosen loop in the shared world, an addressed notification is created for the relevant recipient, and the change persists like any other world mutation

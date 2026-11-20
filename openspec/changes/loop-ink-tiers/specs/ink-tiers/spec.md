## ADDED Requirements

### Requirement: Ink+ includes Ink
A person SHALL have one of three plans:
- Loopd (free);
- Ink, at $2.99 a month;
- Ink+, at $9.99 a month.

Everything that comes with Ink SHALL also come with Ink+.

#### Scenario: An Ink animal for someone on Ink+
- **WHEN** a person who asked only for Ink+ picks an animal that comes with Ink
- **THEN** it becomes their face, with no ask

#### Scenario: The group picture
- **WHEN** a person on Ink+ opens the group picture's animals
- **THEN** the Ink animals are among them

### Requirement: Animals from a pet photo follow the plan
The number of animals a person may draw from a pet photo SHALL depend on their plan:
- Loopd (free): none. A free person's first animal is their subscribe to Ink, as today.
- Ink: three in all.
- Ink+: no limit.
- The admin: no limit.

The maker SHALL say how many are left on Ink. On Ink+ it SHALL show no count.

#### Scenario: Ink, the third animal
- **WHEN** a person on Ink who has made two animals makes another
- **THEN** it is made, and the maker says none are left and offers Ink+

#### Scenario: Ink, after three
- **WHEN** a person on Ink who has made three animals tries again
- **THEN** no animal is made, and they are offered Ink+

#### Scenario: Ink+
- **WHEN** a person on Ink+ has made five animals
- **THEN** they can make a sixth, and the maker shows no count

#### Scenario: Ink+ without an Ink ask
- **WHEN** a person on Ink+ who never asked for Ink makes their first animal
- **THEN** they are not asked for an email again

### Requirement: Two marks
The app SHALL draw two marks:
- the **Ink mark**, the blot alone, on what comes with Ink;
- the **Ink+ mark**, the same blot with a four-point spark cut into its middle, on what comes with Ink+.

No place SHALL use the Ink+ mark for something that comes with Ink, or the Ink mark for something that comes only with Ink+.

#### Scenario: The picker's Ink animals
- **WHEN** a person opens the animal picker
- **THEN** the Ink filter and the Ink animals wear the Ink mark, with no spark

#### Scenario: An Ink+ ask
- **WHEN** the Assistants card, the colours card, the save card or the group picture asks for Ink+
- **THEN** its "Ink+" tab wears the Ink+ mark

#### Scenario: Locked school colours
- **WHEN** the "Any school" list shows a school that needs Ink+
- **THEN** that school wears the Ink+ mark

### Requirement: Ink+ faces sparkle
The face of a person on Ink+ SHALL sit on the same blot as an Ink face, with three small sparks around it that twinkle in turn. Where motion is reduced, the sparks SHALL be shown still. The loading splat SHALL show the sparks for a person on Ink+. A free face SHALL have no blot, and an Ink face SHALL have the blot alone.

#### Scenario: A pile with all three plans
- **WHEN** a ticket's pile shows one free face, one Ink face and one Ink+ face
- **THEN** the free face is plain, the Ink face is on a blot, and the Ink+ face is on a blot with sparks

#### Scenario: Your own avatar
- **WHEN** a person on Ink+ looks at their avatar in the campus bar or the groups bar
- **THEN** it wears the blot and the sparks

#### Scenario: Loading
- **WHEN** a page loads for a person on Ink+
- **THEN** the splat shows their face with sparks

#### Scenario: Reduced motion
- **WHEN** the device asks for reduced motion
- **THEN** the sparks are shown and do not move

### Requirement: Asks state the right plan and price
Every ask for an Ink+ perk SHALL name Ink+ and $9.99 a month. Every ask for an Ink perk SHALL name Ink and $2.99 a month.

To a person who already has Ink, an Ink+ ask SHALL say what Ink+ adds, and that it is $9.99 in place of $2.99.

#### Scenario: The colours card
- **WHEN** a person without Ink+ picks another school's colours
- **THEN** the card's price reads $9.99 a month

#### Scenario: Someone on Ink meets an Ink+ ask
- **WHEN** a person on Ink opens the Assistants ask
- **THEN** the card says they have Ink, what Ink+ adds, and "$9.99 a month, in place of $2.99"

### Requirement: The Ink page lists the plans as approved
The Ink page SHALL list what Loopd, Ink and Ink+ each give, as in the approved table:
- Assistants and the group picture under Ink+;
- pet-photo animals as 3 on Ink and No limit on Ink+;
- playing as your own animal under Ink;
- "New things first" as an Ink+ row.

Rows not built yet SHALL say so.

#### Scenario: Assistants
- **WHEN** a person reads the Ink page's table
- **THEN** "Connect your assistant" is ticked for Ink+ only

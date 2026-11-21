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
- **THEN** its tab is the Ink+ mark

#### Scenario: Locked school colours
- **WHEN** the "Any school" list shows a school that needs Ink+
- **THEN** that school wears the Ink+ mark

### Requirement: Features show the plan by its mark, not its name
Where a feature, a button, a pill, an animal or a list item is marked as coming with a plan, it SHALL show that plan's mark and SHALL NOT write the plan's name beside it:
- the blot means Ink;
- the blot with the spark means Ink+.

Every such mark SHALL have the accessible name "Ink" or "Ink+".

The words "Ink" and "Ink+" SHALL appear only where plans are named or compared:
- the Ink page and its tab in the top bar;
- the account card's plan row;
- the body of an ask card, which says what the plan gives and its price.

#### Scenario: The foot's colours pill
- **WHEN** a person without Ink+ sees the foot
- **THEN** the pill reads "Every school" with the Ink+ mark, and no "Ink+" text

#### Scenario: The game's pill
- **WHEN** a person with neither plan opens Seats or Conga
- **THEN** the pill reads "Play as your own animal" with the Ink mark, and no "Ink" text

#### Scenario: An ask card
- **WHEN** the Assistants ask opens
- **THEN** its tab is the Ink+ mark alone, and its body names Ink+ and $9.99

#### Scenario: A screen reader
- **WHEN** a screen reader reaches a mark
- **THEN** it reads "Ink" or "Ink+"

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

### Requirement: Every ask signs you up
Every place that asks a person to look into an Ink or Ink+ feature SHALL let them sign up for that plan right there, with one press. This covers:
- the Ink page's plan cards;
- the colours card;
- Assistants;
- saving with no mark;
- the group picture;
- the pet maker;
- the account row's Ink+ offer;
- the Seats and Conga asks.

Signing up SHALL give them the plan at once, since there is no payment yet. It SHALL record:
- who signed up;
- the email of their account;
- which plan;
- the feature and the button it was pressed on;
- when.

Every sign-up SHALL thank them in the same words: the feature is not ready yet, and they have been upgraded for now. A person who is signed out SHALL be sent to sign in, and brought back.

#### Scenario: The Ink page
- **WHEN** a signed-in person on Loopd presses "Get Ink+" on the Ink page
- **THEN** they have Ink+, the press is recorded with the place "ink page: Get Ink+", and the card thanks them

#### Scenario: A game
- **WHEN** a signed-in person with neither plan signs up from the Seats ask
- **THEN** they have Ink, the press is recorded with the Seats place, and the ask thanks them

#### Scenario: Signed out
- **WHEN** a signed-out visitor presses "Get Ink" on the Ink page
- **THEN** they are sent to sign in, and come back to the Ink page

#### Scenario: Already on the plan
- **WHEN** a person on Ink+ presses a sign-up for Ink+
- **THEN** nothing changes, the press is still recorded, and they are told they have it

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

### Requirement: The Ink page knows you
The Ink page SHALL show each ticket for the person looking (direction A of public/demo/mockups-ink-join.html):
- the plan they have: lifted, punched, with a "Your plan" tab;
- plans under it: faded, saying they are in theirs;
- Ink+ for someone on Ink: "Move to Ink+", in place of Ink and not on top of it;
- signed out: every "Get" goes to sign in and back.

#### Scenario: On Ink
- **WHEN** someone with Ink opens the Ink page
- **THEN** the Ink ticket is theirs, Loopd's says "In Ink", and Ink+'s offers "Move to Ink+"

### Requirement: Signing up confirms, waits, and says nothing was charged
Pressing "Get" on the Ink page SHALL open a confirm slip under that ticket: the plan, its price, when it renews, cancel any time, and today's total. "Confirm" SHALL wait about two seconds as a payment would, then sign them up and record the press. The answer SHALL say the plan is on, that they were not charged, and that they will be emailed before payments open. No card is asked for.

#### Scenario: Confirming Ink+
- **WHEN** a free person presses "Get Ink+" and then "Confirm"
- **THEN** after the wait they have Ink+, the press is recorded as "ink page: Get Ink+", and the page says "Ink+ is on. You weren't charged."

### Requirement: 15 minutes?
After signing up on the Ink page, the person SHALL be asked whether, as a student or an organizer, they would give a 15-minute Zoom call. They pick which they are, then type when suits them in one free line, the way a post is typed ("@tue @2pm or @12/12 @10am"), with a few hints to tap in. The line is kept as written; it is not read into times. Each ask SHALL be kept with who, their email and when, and listed on the admin page's Premium tab. Nothing is booked: the founder writes back.

#### Scenario: Sending times
- **WHEN** an organizer types "@tue @2pm or @12/12 @10am" and presses "Send my times"
- **THEN** the ask is kept with that line, and the page says they will be emailed to settle a time from it

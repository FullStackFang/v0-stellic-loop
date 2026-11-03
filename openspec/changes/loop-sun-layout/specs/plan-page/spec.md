## ADDED Requirements

### Requirement: The plan page shows the plan and one action
`/p/<id>` SHALL render for anyone with the link, lit per `sun-visual-system`, with in order: the header (wordmark linking to the space, a chip with the space name linking to the space), a state tag ("Open · forms at <threshold>" or "Formed · <n> of <threshold>"), the title in uppercase on up to two lines, the when line (day and time in bold, any second line, then the place), the forecast chip, the count as a large numeral with "of <threshold>" and a lead word ("one more", "<k> more", "formed"), one bar per place at the threshold filled for each person in, a lead sentence ("One more and it forms." / "<k> more and it forms." / "Formed. One message went to all <n>."), the faces of people in with first names, anyone who dropped after formation as a small grey row, the shared details as a read list, and a pinned bar with the primary button and one low-emphasis secondary action. Nothing else SHALL appear: no day grid, no maybe, no ask, no share or copy actions, no poster controls, no back button.

#### Scenario: Open plan
- **WHEN** a person opens "Overnight boat", Fri 20 Feb 6:00pm at Cat Ba pier, with Marcus, Elena and Tom in and a threshold of 4
- **THEN** the page reads "Open · forms at 4", the count "3 of 4 · one more", three filled bars and one empty, the three faces plus a dashed "+1 one more" slot, and the pinned button "I'm in" with "Can't make it" under it

#### Scenario: Signed-out reader
- **WHEN** a visitor with no cookie opens a plan link
- **THEN** the whole page renders, including names, and nothing prompts for sign-in until I'm in is tapped

### Requirement: Faces are first names, up to six
The faces row SHALL show the people in, the viewer first as "You", with photo or initial in a 68px ring and the first name below, up to six; beyond six it SHALL show "+<k> more". With five or six people the ring SHALL be 54px so the row never wraps. Before formation the row SHALL end with one dashed slot reading "+1 one more" when one place remains, otherwise "+<k>".

#### Scenario: Seven in
- **WHEN** a formed plan has seven people in
- **THEN** six faces render and a seventh tile reads "+1 more"

### Requirement: One primary button per state
The pinned button SHALL be: "I'm in" when the viewer is not in; "You're in · <day>" (ink, tint text, with a check) when the viewer is in on a formed plan; "You're in" on an open plan, with "Can't make it" as the secondary. The secondary SHALL be "Can't make it" (sets the answer to out) before formation and for a viewer in, and "Add to calendar" (the invite link) on a formed plan the viewer is in. Tapping I'm in with no session SHALL open the identity step inline per `board-identity` and then record the answer.

#### Scenario: Fourth tap forms it
- **WHEN** the viewer taps I'm in on a plan at 3 of 4
- **THEN** the count animates to 4, the fourth bar fills, the tag reads "Formed · 4 of 4", the lead reads "Formed. One message went to all 4.", the button becomes "You're in · Fri 20 Feb" and the secondary becomes "Add to calendar"

#### Scenario: Can't make it
- **WHEN** the viewer, who is in on an open plan, taps Can't make it
- **THEN** their answer is out, the count drops by one, their face leaves the row and the button reads "I'm in" again

### Requirement: Didn't form page
When the plan idled, the page SHALL use the didn't-form treatment: tag "Didn't form · <n> of <threshold>", the when line prefixed "Was", a line stating the day's weather if known and "Nobody's fault.", the count "<n> of <threshold> · closed", the bars, "<n> were in. Nobody has to chase anyone.", the faces of those who were in with empty dashed slots for the rest, a ruled line "Try a different night? Posting again starts a fresh count." attributed to Loop, the ghost button "Post it again" and "Back to <space>" under it. "Post it again" SHALL open the post form prefilled with the title, day, time and place and record `version_of`.

#### Scenario: Didn't form
- **WHEN** "Wine night" idled at 2 of 4 after 14 days
- **THEN** the page is flat grey with no sun, names Marcus and Elena, shows two empty slots, and its only button is "Post it again"

### Requirement: Past plan
A formed plan whose day has passed SHALL render as formed with the tag "Happened · <day>", no primary button, and "Add to calendar" removed.

#### Scenario: After the day
- **WHEN** a person opens a plan formed for a day that is over
- **THEN** the page shows the formed count and faces and no pinned bar

### Requirement: Share preview matches the count
The OG image for `/p/<id>` SHALL show the title, the count "<n> of <threshold>" and the state on the plan's tint in Archivo, regenerated when the count changes, with no other visual system.

#### Scenario: Unfurl
- **WHEN** a plan link at 3 of 4 is pasted into a chat
- **THEN** the preview image shows "3 of 4" on the plan's tint and the title in uppercase

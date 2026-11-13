## MODIFIED Requirements

### Requirement: A title is enough to post
The post form SHALL take a title (required, at most 80 characters) and, all optional and visible without a fold: a day chosen from the board's window days as a row of chips, a time as text with the hint "7:30pm", and a place as text. There SHALL be no icon picker, cost, minimum, links, detail line or "needs a day" switch. Posting SHALL create the proposal with `status=open`, `needs_day=false`, the slot stored, record the poster as `in`, and write a `proposal_posted` event.

#### Scenario: Minimal post
- **WHEN** a signed-in person posts "Suits in Hoi An" with nothing else
- **THEN** a proposal exists with that title, no day, no time, no place, the poster in, and one `proposal_posted` event

#### Scenario: Full post
- **WHEN** a person posts "Overnight boat", picks Fri 20 Feb, types "6:00pm" and "Cat Ba pier"
- **THEN** the proposal has day 2027-02-20, time text "6:00pm", place "Cat Ba pier", and the plan page is lit at 18:00

### Requirement: Title, minimum and cost are fixed after posting
After posting, the title SHALL NOT be editable. The poster SHALL be able to edit the day, time and place of an open proposal per `intent-slot`. Legacy minimum and cost values SHALL be read-only.

#### Scenario: Edit attempt on the title
- **WHEN** the poster opens their open proposal
- **THEN** the title is read-only and the day, time and place are editable

### Requirement: Anyone in can add shared details
A person who is `in` on a proposal SHALL be able to add a link or a note from the plan page. Each addition SHALL show who added it as a small uppercase name on the right of the row. Nobody SHALL be notified about details. A person not `in` SHALL see the details and no add row.

#### Scenario: Add a link
- **WHEN** Marcus, who is in, submits "Operator page · Bai Tho Junks" with a URL
- **THEN** a `link` detail row appears with the linked text and "Marcus" on the right, and a `detail_added` event exists

#### Scenario: Not in
- **WHEN** a person who is not in views the details
- **THEN** the rows are shown and no add row is shown

### Requirement: Post a version
A didn't-form plan SHALL offer "Post it again", which opens the post form prefilled with the title, day, time and place, and records `version_of` on the new proposal. No other plan SHALL offer a version action.

#### Scenario: Post it again
- **WHEN** a person taps "Post it again" on "Wine night" (didn't form) and posts with a new day
- **THEN** a new open proposal "Wine night" exists with `version_of` pointing at the original and the original is unchanged

# Spec Delta

## Purpose

Posting is broadcasting interest: a title is enough, the poster is in, and everything else is optional and shared.

## ADDED Requirements

### Requirement: A title is enough to post
The post form SHALL require only a title and a "needs a day" switch (default on). Behind a fold it SHALL offer, all optional: a one-line detail, rough cost as text, time as text, a minimum number, and links one per line. Posting SHALL create the proposal with `status=open`, record the poster as `in` with their free days attached, and write a `proposal_posted` event.

#### Scenario: Minimal post
- **WHEN** a signed-in person posts "Suits in Hoi An" with nothing else
- **THEN** a proposal exists with that title, needs a day, no minimum, the poster in, and one `proposal_posted` event

#### Scenario: Post with links
- **WHEN** the links field contains two lines
- **THEN** two `link` details exist, attributed to the poster

### Requirement: Posting requires identity
A visitor with no session SHALL be asked for name and number as part of posting, following the `board-identity` rules; the proposal SHALL NOT exist until identity is established.

#### Scenario: Stranger posts
- **WHEN** a visitor with no cookie submits the post form
- **THEN** they are asked for name and number, and on success the proposal is created with them as poster

### Requirement: Title, minimum and cost are fixed after posting
After posting, the title, the minimum number, the cost and the "needs a day" switch SHALL NOT be editable. The poster SHALL be able to edit the detail line and the time at any time without any notification.

#### Scenario: Edit attempt on the number
- **WHEN** the poster opens their proposal
- **THEN** title, number, cost and the day switch are read-only and the detail line and time are editable

### Requirement: Anyone in can add shared details
A person who is `in` on a proposal SHALL be able to add a link, a place or a note. Each addition SHALL show who added it. Nobody SHALL be notified about details. A person not `in` SHALL see the details and a prompt to tap in to add.

#### Scenario: Add a link
- **WHEN** Marcus, who is in, submits "reddit.com/r/hoian" in the add row
- **THEN** a `link` detail appears attributed to Marcus and a `detail_added` event exists

#### Scenario: Not in
- **WHEN** a person who is `maybe` views the details
- **THEN** no add row is shown and the page says "Tap in to add details"

### Requirement: Post a version
Every proposal SHALL offer "Post a version of this", which opens the post form prefilled with the proposal's title, detail, cost, time, minimum and day switch, and records `version_of` on the new proposal.

#### Scenario: Cheaper version
- **WHEN** a person posts a version of "Overnight boat" with the cost changed
- **THEN** a new proposal exists with `version_of` pointing at the original and the original is unchanged

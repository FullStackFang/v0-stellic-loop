## ADDED Requirements

### Requirement: One page starts a group
The site SHALL offer one page for starting a group. Its header SHALL be a single row holding the group's name, the handle the group will get, and where the group lives. Only the name SHALL be required. The handle SHALL be suggested from the name and SHALL be editable until the group is made. The page SHALL be shown only to a person who may start a group somewhere: a pilot owner, or an owner or organizer of at least one group.

#### Scenario: Name only
- **WHEN** a pilot owner types a name and chooses "Create group"
- **THEN** a top-level group with that name and the suggested handle exists and the person is its owner

#### Scenario: Handle follows where the group lives
- **WHEN** the person types "NBAE 6830" and puts the group inside "Team 1" of `@emba-2027`
- **THEN** the header shows the handle `@emba-2027/nbae-6830`

#### Scenario: Not allowed to start anything
- **WHEN** a person who is neither a pilot owner nor an owner or organizer of any group opens the page
- **THEN** the form is not shown

### Requirement: Choosing where the group lives
"Where it lives" SHALL open a picker with one column per level. The first column SHALL list "Top level, on its own" (only for a pilot owner) and the groups the person can open at their top. Choosing a group SHALL show the groups inside it in the next column. The picker SHALL say, before the person confirms, where the group will go and who will be able to open it. A group the person may not start a group inside SHALL be shown for walking through but SHALL NOT be offered as the place. Escape or a click outside SHALL close the picker without changing the choice.

#### Scenario: Footer states who can open it
- **WHEN** the person selects "Team 1" inside "EMBA 2027"
- **THEN** the picker reads that the group goes inside "EMBA 2027 › Team 1" and that everyone in "Team 1" can open it

#### Scenario: Top level
- **WHEN** a pilot owner selects "Top level, on its own"
- **THEN** the picker reads that only people they invite can open it

#### Scenario: A group the person only belongs to
- **WHEN** the person selects a group where they are a member but not an owner or organizer
- **THEN** "Put it here" is disabled and the picker says only its organizers can start a group there

#### Scenario: The server decides
- **WHEN** a create request names a parent the person may not start a group inside
- **THEN** the request is refused and no group is made

### Requirement: One box takes everything else
Below the header the page SHALL offer one box that accepts dropped or chosen files, pasted web addresses, email addresses and plain text, and sorts each into a lane: Files, Links, People, and the first announcement. The Files, Links and People lanes SHALL always be shown with a count; the first announcement SHALL appear only when there is one. Each item SHALL be removable before the group is made. Each lane SHALL say in one line what Loop will do with its items.

#### Scenario: A link and an email pasted together
- **WHEN** the person pastes a line holding `https://example.edu/syllabus` and `priya@example.edu`
- **THEN** the address appears under Links and the email under People

#### Scenario: Plain text becomes the first announcement
- **WHEN** the person types "Kickoff is Thursday at 6" and presses Enter
- **THEN** that text appears under First announcement and can be edited

#### Scenario: Something that is not a valid link or email
- **WHEN** the person pastes `http://` on its own, or a link that does not start with `https`
- **THEN** nothing is added to Links and the page says so

#### Scenario: A file too large to send with the form
- **WHEN** the person drops a file larger than the form can carry
- **THEN** the file is not added and the page says to add it on the group's Resources page after the group is made

### Requirement: Creating applies each lane
On create, the system SHALL make the group first. If that fails, nothing else SHALL be done and the form SHALL keep what the person entered and say why. After the group exists the system SHALL: keep a copy of each file as a group resource; save each link with its address and a title; invite each email address as a member (Loop sends no email: the person sees the invitation when they sign in with that address, and the form says so); post the announcement; and turn on the group's join link. A failure in one of these SHALL NOT undo the group or the others.

#### Scenario: Everything lands
- **WHEN** the person creates a group with one PDF, two links, one email address and an announcement
- **THEN** the group has that resource, those two links in its record, one pending invitation, that announcement, and a working join link

#### Scenario: Handle taken
- **WHEN** the handle is already used
- **THEN** no group is made, nothing from the lanes is saved, and the form still holds the name, the lanes and the chosen place

#### Scenario: One file cannot be read
- **WHEN** the group is made and one of two files cannot be read
- **THEN** the group, the other file and every other lane are saved, and the person is told which file was not added

### Requirement: The group is ready page
After a group is made the person SHALL land on a page that shows: the group's name, handle and where it lives; the join link with a copy control; how to connect an assistant; what was added from each lane; anything that was not added, by name; and one way into the new group. The join link SHALL be shown only on this page load and SHALL NOT be stored where a later visit can read it back.

#### Scenario: Ready after a full create
- **WHEN** a group is made with files, links and an invitation
- **THEN** the page lists them, shows the join link once, and "Open the group" leads to the new group's page

#### Scenario: Reloading does not show the link again
- **WHEN** the person reloads the ready page
- **THEN** the empty start form is shown, the join link is not, and the group's Members page is where a new one is made

### Requirement: The old start form is gone
The inline three-field form on the groups home page SHALL be removed. Every way to start a group SHALL lead to the one start page.

#### Scenario: First group
- **WHEN** a pilot owner with no groups opens the groups home page
- **THEN** they see one "Start your group" control that opens the start page

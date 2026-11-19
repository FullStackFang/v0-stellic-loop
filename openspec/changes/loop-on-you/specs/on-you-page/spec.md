## ADDED Requirements

### Requirement: The campus screen lists what is on the viewer across their groups
For a signed-in viewer the campus screen SHALL show a list of what is waiting for them across every group they belong to: open asks they may answer and have not, dated events they have not acted on, and ideas waiting for them. Events here are group events; campus listings are not part of the list. The list SHALL show nothing about any other member and nothing from a group the viewer does not belong to, however open that group is. When nothing is waiting, or the viewer is signed out, the list SHALL NOT be drawn.

#### Scenario: Items from two groups
- **WHEN** a member has an unanswered ask in one group and an unanswered event in another and opens the campus screen
- **THEN** both appear in one list, each naming its group

#### Scenario: Nothing waiting
- **WHEN** a member with nothing waiting opens the campus screen
- **THEN** the counter shows no number, its panel says nothing is waiting, and the rest of the screen is as before

#### Scenario: In no group
- **WHEN** a signed-in person who belongs to no group opens the campus screen
- **THEN** no counter is drawn

#### Scenario: An open group the viewer has not joined
- **WHEN** an open group the viewer does not belong to has an open ask
- **THEN** that ask is not on the viewer's list

#### Scenario: A follower
- **WHEN** a person who only follows a group opens the campus screen
- **THEN** no ask or event from that group is listed for them

#### Scenario: Signed out
- **WHEN** a signed-out visitor opens the campus screen
- **THEN** no list is drawn

### Requirement: The list is ordered by when
The list SHALL be ordered soonest first across all kinds: an ask by when it closes, an event or idea by when it starts. An idea with no time SHALL come last. The list SHALL show at most 30 rows and, for each group with more, how many more and a link to that group.

#### Scenario: A later ask and a sooner event
- **WHEN** a member has an ask closing Friday and an event on Thursday
- **THEN** the event is listed above the ask

#### Scenario: More than fits
- **WHEN** a member has 40 items waiting
- **THEN** the 30 soonest are listed and the rest are counted per group with a link to each

### Requirement: Each row says the kind, what, which group and when
Each row SHALL show a kind label, what the item is, the group it belongs to, and its time. The label SHALL be "Do" for a to-do and for an idea whose proposer has something to settle, "Vote" for any other ask, and "Show up" for an event and for an idea that is one person short.

#### Scenario: A to-do row
- **WHEN** a to-do "Upload W8/W9" due Nov 22 in EMBA Council is waiting for the member
- **THEN** its row reads Do, "Upload W8/W9", EMBA Council, and the due time

### Requirement: Simple items are acted on in the row
A member SHALL be able to mark a to-do done, cast a pick-one vote that has at most 4 options, and answer an event (in, or not for me) from its row. The write SHALL pass the same checks as the same action elsewhere on the site. After a successful write the row SHALL leave the list. Any other item SHALL link to its existing page.

#### Scenario: Ticking a to-do
- **WHEN** a member presses Done on a to-do's row
- **THEN** their answer is recorded, the row leaves the list, and the to-do's count rises by one

#### Scenario: A vote with many options
- **WHEN** a pick-one ask with 6 options is waiting
- **THEN** its row shows no option buttons and links to the ask's page

#### Scenario: Closed in the meantime
- **WHEN** a member presses a button on a row whose ask closed after the page loaded
- **THEN** nothing is saved, the member is told it has closed, and the row leaves the list

#### Scenario: Too many writes this hour
- **WHEN** a member presses a row's button after the group's hourly limit on writes is reached
- **THEN** nothing is saved, the member is told to try again later, and the row stays

### Requirement: A missed to-do stays on the list for a while
A to-do that passed its due time without the viewer marking it done SHALL stay on their list for 7 days, marked as missed, after every item still open, with no button. If its due time is extended it SHALL return to the list as an ordinary row. A to-do the viewer did mark done SHALL NOT be shown as missed.

#### Scenario: Missed yesterday
- **WHEN** a to-do passed yesterday and the viewer had not marked it done
- **THEN** it is on their list marked "Missed", below the open items, with the group and when it passed, and no Done button

#### Scenario: Extended
- **WHEN** the organizer extends that to-do to next Friday
- **THEN** it is on the viewer's list as an ordinary "Do" row with a Done button

#### Scenario: After a week
- **WHEN** 8 days have passed since a missed to-do's due time and it was not extended
- **THEN** it is no longer on the list

### Requirement: Work proposed for the viewer arrives as an alert
When a teammate has proposed a piece of work for the viewer and the viewer has not answered, the campus screen SHALL show an alert saying who proposed it, what it is, which group, and its due date if it has one, with one control to accept and one to decline. Accepting and declining SHALL be the existing confirm and decline of a proposed claim. The alert SHALL stay until the viewer answers, and SHALL be shown again on a later visit if left unanswered. Proposed work SHALL NOT appear as a row in the list. With motion reduced in the viewer's settings, the alert SHALL appear without animation.

#### Scenario: A proposal waiting
- **WHEN** a teammate proposed "Book the room" for the viewer and the viewer opens the campus screen
- **THEN** an alert names the teammate, "Book the room" and the group, with "It's mine" and "Not mine"

#### Scenario: Accepting
- **WHEN** the viewer presses "It's mine"
- **THEN** the claim becomes theirs and open, and the alert goes

#### Scenario: Declining
- **WHEN** the viewer presses "Not mine"
- **THEN** the proposal is declined and the alert goes

#### Scenario: Ignored
- **WHEN** the viewer leaves without answering and returns the next day
- **THEN** the alert is shown again

### Requirement: A person who may ask in a group can do so from the campus screen
A signed-in viewer who may post in at least one group SHALL be able to start an ask of any kind, including something to do, from the campus screen, choosing the group when they may post in more than one. The same rights, limits and refusals SHALL apply as for an ask made anywhere else. This SHALL NOT depend on the viewer being the site's admin. A viewer who may post in no group SHALL NOT be offered it.

#### Scenario: A club's organizer who is not the admin
- **WHEN** the organizer of a club, who is not the site's admin, posts "Upload your W8/W9" due Nov 22 from the campus screen
- **THEN** the to-do is saved in that club and appears on its members' lists

#### Scenario: Two groups
- **WHEN** a viewer who may post in two groups starts an ask
- **THEN** they choose which group it is for before it is saved

#### Scenario: A follower only
- **WHEN** a viewer who only follows groups opens the campus screen
- **THEN** they are not offered a way to start an ask

### Requirement: A group's organizers manage its asks without being the admin
The person who asked, and the group's owners and organizers, SHALL be able to open an ask's page, see who has not answered, use the reminder, extend or reopen it and close it, whether or not they are the site's admin.

#### Scenario: Seeing who has not done it
- **WHEN** a club's organizer who is not the admin opens the page of a to-do in their club
- **THEN** they see the count, who has not done it, the reminder, and the controls to extend and close

### Requirement: A row's link opens for the member
Every page a row links to SHALL open for a signed-in member of that item's group, and the member SHALL be able to act there. A person who is not in the group SHALL see no more than they do today.

#### Scenario: A dates ask
- **WHEN** a member who is not the admin follows the link on a dates ask's row
- **THEN** the ask's page opens and they can answer it

#### Scenario: Someone outside the group
- **WHEN** a signed-in person who is not in the group opens the same link
- **THEN** they see what they see today and no more: the outside view of the ask where the groups site is in front, and the front door where the campus screen is

### Requirement: Opening the page does not use up what the assistant has yet to tell the member
The page SHALL NOT mark any mention or announcement as shown.

#### Scenario: An unseen announcement
- **WHEN** a member with a new announcement opens the campus screen and then asks their assistant what is waiting
- **THEN** the assistant still returns the announcement

### Requirement: The list does not hold up the rest of the screen
The campus screen's events SHALL render without waiting for the list to finish loading.

#### Scenario: A slow read
- **WHEN** the list takes longer to read than the week's events
- **THEN** the events are shown first and the list fills in when ready

### Requirement: A person can reach every group they belong to from the campus screen
With the campus screen in front, the groups site SHALL open for a signed-in person who belongs to at least one group, and each group page SHALL show them what their role in that group allows. The campus top bar SHALL show a "Groups" counter that opens a panel listing every group the person is in (a group inside another under its parent), each with who is in it, the next thing in it that waits on them and how many do, linking to its page, and the outings on this week that they are going to, each linking to its ticket. A person who belongs to no group SHALL NOT be able to open the groups site.

#### Scenario: A member of Team 1 who is not the admin
- **WHEN** they press "Groups" in the top bar
- **THEN** "You belong to" lists Team 1 with its members' faces and what waits on them there, and following it opens Team 1's page

#### Scenario: Going to an outing and in no group
- **WHEN** a person who joined a running group posted on the campus week presses "Groups"
- **THEN** "You are going" lists that outing with its day and time, and following it opens its ticket

#### Scenario: In no group
- **WHEN** a signed-in person who belongs to no group opens a group's address
- **THEN** they are sent to the front door

#### Scenario: A role that ended
- **WHEN** a person whose only role was revoked opens a group's address
- **THEN** they are sent to the front door

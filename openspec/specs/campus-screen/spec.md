# campus-screen Specification

## Purpose
TBD - created by archiving change loop-campus-rewards. Update Purpose after archive.
## Requirements
### Requirement: One screen
The campus screen SHALL fit one window without page scrolling at 1440 by 900, with an event closed or opened. The section under the top bar SHALL take the height the window has left. On a window too short to hold it, the page SHALL scroll and SHALL NOT clip content.

#### Scenario: Desktop window
- **WHEN** a person opens the screen in a 1440 by 900 window
- **THEN** the top bar, search, the row and the rewards shelf are all visible and the page does not scroll

#### Scenario: Opening an event adds no height
- **WHEN** a person opens an event's details in that window
- **THEN** the page height does not change

#### Scenario: Short window
- **WHEN** a person opens the screen in a window 700 pixels tall
- **THEN** the page scrolls and nothing is cut off

### Requirement: Top bar on one line
The top bar SHALL be one line holding the Loop mark, "This week", the person's groups by name, the Ink tab, "Post a plan" and the person's avatar with its level badge. A group SHALL be listed only for a person who is able to open it. The Ink tab SHALL be shown to everyone, signed in or not, SHALL be a pill, and SHALL open the Ink page. When a group reward is unlocked and not yet used, the bar SHALL also show it. The bar SHALL NOT hold a page title band or reward pills.

#### Scenario: Groups for someone who can open them
- **WHEN** the admin, who belongs to three groups, opens the screen
- **THEN** the top bar lists those three groups by name, each a link to its page

#### Scenario: Groups for someone who cannot
- **WHEN** a student who cannot open any group page opens the screen
- **THEN** the top bar lists no groups

#### Scenario: Reward unlocked
- **WHEN** a person's group reward has unlocked and has not been used
- **THEN** the top bar shows "Show at the counter" with the reward and the current time

#### Scenario: Signed out
- **WHEN** a signed-out visitor opens the screen
- **THEN** the top bar shows "Sign in" where the avatar would be

#### Scenario: The Ink tab
- **WHEN** anyone, signed in or not, opens the screen
- **THEN** the top bar shows a pill reading "Ink" with the Ink mark, and pressing it opens the Ink page

#### Scenario: The Ink tab on a narrow screen
- **WHEN** the screen is narrower than 520px
- **THEN** the tab shows the Ink mark alone and is still named "Ink" to a screen reader

### Requirement: Events as a sideways row of tickets
Events SHALL be shown as ticket cards side by side in one row that scrolls sideways, with arrows to move it. The system SHALL NOT offer a "show all" control and SHALL NOT expand the list downward. A ticket's upper half SHALL show the day and time, the title, who posted it or its source label and host, its place, and a "Details" control. Its lower half SHALL be visibly part of the same ticket, cut like a tear-off stub.

#### Scenario: More events than fit
- **WHEN** the row holds more tickets than the window is wide
- **THEN** an arrow moves the row sideways and the page does not grow

#### Scenario: Every ticket opens
- **WHEN** a person presses "Details" or any part of a ticket that is not a button
- **THEN** that event opens

### Requirement: The reward leads the ticket
A ticket for an event with a group reward SHALL show on its stub: who gives the reward, the reward as the largest line, the group size and how close the group is, one seat per person needed with the faces of those in, and one action. A ticket for an event that counts toward a building reward SHALL show the reward and the person's progress as steps. A ticket for an event with no reward SHALL claim none.

#### Scenario: One short
- **WHEN** a reward needs six, five are in, and the viewer is not
- **THEN** the stub shows five faces, one empty seat marked as the viewer's, and a line that the viewer would unlock it

#### Scenario: Checked-in marks
- **WHEN** two of three people in the viewer's outing have checked in
- **THEN** their two faces are marked as checked in and the stub reads 2 of 3 checked in

#### Scenario: No reward
- **WHEN** an event has no reward
- **THEN** its lower half shows who the viewer knows that is going, or that nobody they know is going yet, and no reward wording

#### Scenario: One action
- **WHEN** a person looks at any ticket
- **THEN** its stub offers the one next step for them: "I'm in" or "Register", then "Check in" when the window is open, with "Invite" beside it once they are in

### Requirement: Details unfold sideways
Opening an event SHALL unfold a panel to the right of its ticket, inside the row and as tall as the tickets, and SHALL move the row so the ticket and its panel are in view. The panel SHALL show what the event is, how its reward unlocks, when it is, the people the viewer knows who are going, the map when the place is known, and the actions. "Invite people" SHALL show in the same panel. Only one event SHALL be open at a time.

#### Scenario: Open
- **WHEN** a person opens the "Sunset run" ticket
- **THEN** a panel appears beside it in the row with the description, how the reward unlocks, the people they know who are going and a map

#### Scenario: Close
- **WHEN** a person presses "Close" on the ticket or the panel
- **THEN** the panel is removed and the row is as it was

#### Scenario: Opening a second event
- **WHEN** a person opens another ticket while one is open
- **THEN** the first closes and the second opens

### Requirement: Rewards shelf under the row
When a signed-in person is earning or has earned at least one building reward, the screen SHALL show "Rewards you are earning" under the row as coupons, each with the giver, the reward, progress, and "Ready" when earned. With none, the shelf SHALL NOT be shown.

#### Scenario: Three rewards in progress
- **WHEN** a person has one earned reward and two in progress
- **THEN** three coupons are shown, the earned one marked "Ready"

#### Scenario: Nothing yet
- **WHEN** a person has no progress on any building reward
- **THEN** no shelf is shown

### Requirement: Colours by role
The campus screen SHALL take its colours from its own set of role tokens (field, field shadow, ink, action, paper, page, line, mute), with a lime green field and navy ink in place of the mockup's coral. Type on the field colour SHALL meet a contrast of 4.5 to 1. The action colour SHALL be used for actions only. The screen SHALL NOT change the tokens of the groups site.

#### Scenario: Changing the palette
- **WHEN** a token value is changed in the campus stylesheet
- **THEN** every surface of that role changes with it and no page of the groups site changes

### Requirement: Student wording
Text on the campus screen SHALL NOT mention advising, counsellors or any signal sent to staff, SHALL NOT use emoji, and SHALL NOT show a solo price, a countdown or a deadline for filling a group.

#### Scenario: Reward wording
- **WHEN** a ticket shows a group reward
- **THEN** it shows what the group gets and how many are needed, and no price for going alone and no time limit for filling the group

### Requirement: The map shows one day
The "Near you" map SHALL show the plans of one day of the section in view. When the section has plans on more than one day, the band over the map SHALL carry a pill for each of those days, with how many plans are on that day, and SHALL name the day shown beside its count. The map SHALL open on the first day that has anything on. Pressing a pill SHALL change the map to that day. A plan picked in the list or opened from anywhere on the screen SHALL bring the map to that plan's day and section. The pills SHALL NOT be shown while a ticket is open over the map, or when the section has plans on one day only.

#### Scenario: A week in one section
- **WHEN** a person opens "Near you" on a section with plans today and on Saturday
- **THEN** the map shows today's stamps only, and the band has a "Today" pill and a "Sat" pill, each with its count

#### Scenario: Another day
- **WHEN** that person presses the "Sat" pill
- **THEN** the map shows Saturday's stamps and no others, and the band says how many are on Saturday

#### Scenario: Picked in the list
- **WHEN** the map is on today and the person picks a Saturday plan in the list beside it
- **THEN** the map changes to Saturday and that plan's stamp is the one that is on

#### Scenario: One day only
- **WHEN** every plan in the section is on the same day
- **THEN** the band shows no day pills

### Requirement: Something already on is under Today
A plan that has started and has not ended SHALL be on the map under Today, whichever day it started. A plan's day on the map SHALL be the day it starts, or today when it has already started. A day more than six days ahead SHALL be named with its date as well as its weekday.

#### Scenario: Began last week
- **WHEN** today is Thursday, an exhibition began last Saturday and runs into next week, and a market is this Saturday
- **THEN** the exhibition's stamp is on the map under Today, the market's is under "Sat", and the map opens on Today

### Requirement: One stamp for one address
Plans on the same day at the same address SHALL share one stamp, standing on that address. The stamp SHALL show one of those plans and how many plans are there. The ticket of the plan shown SHALL carry an "Also here" pill naming the next plan at that address and its time; pressing it SHALL turn the stamp to that plan. Beside the list, turning the stamp SHALL also pick that plan in the list, and pointing at any of those plans in the list SHALL lift the shared stamp. A plan alone at its address SHALL have a stamp with no count and no "Also here" pill.

#### Scenario: Two plans, one address
- **WHEN** Bagels at 10am and Chess at 2pm are on the same day at the same address
- **THEN** the map has one stamp there marked 2, and the ticket for Bagels has a pill reading "Also here: Chess, 2pm"

#### Scenario: Turning the stamp
- **WHEN** the person presses that pill
- **THEN** the stamp and its ticket show Chess, and the pill now names Bagels

#### Scenario: Alone at its address
- **WHEN** a plan is the only one at its address that day
- **THEN** its stamp has no count and its ticket has no "Also here" pill

### Requirement: A stamp and its ticket shrink from the spot
When the map is zoomed out, a stamp, the faces and postmark on it, and its ticket SHALL shrink together toward the stamp's address, the stamp that is on included, so that no stamp moves off its address. When the stamps are small, the ticket SHALL fade away, and its "Also here" pill SHALL NOT answer a press while the ticket is hidden. Zooming back in SHALL bring the ticket back.

#### Scenario: The whole section in view
- **WHEN** a person zooms out until the whole of Roosevelt Island is in view
- **THEN** every stamp is small and still on its address, and no ticket is showing

#### Scenario: Hidden ticket
- **WHEN** the ticket has faded and the person presses the map where its "Also here" pill was
- **THEN** the stamp does not turn to another plan

#### Scenario: Zooming back in
- **WHEN** that person zooms back in on a stamp that is on
- **THEN** the stamp grows from its address and its ticket shows again


## ADDED Requirements

### Requirement: Posting an intent
A signed-in person SHALL be able to post an intent on a campus: a line saying what they want to do, with up to four @tags. An intent SHALL need no day, no time and no place. It SHALL appear on the campus at once, with no approval, with the poster in it. An intent SHALL NOT show who posted it. A person SHALL have at most ten open intents they posted.

#### Scenario: Run the island
- **WHEN** a signed-in person posts "Run around the island before class @running"
- **THEN** an intent with that title and tag is on the campus with 1 in, them included, and nothing on it names them as its poster

#### Scenario: Signed out
- **WHEN** a signed-out visitor tries to post an intent
- **THEN** they are sent to sign in and afterwards back to the posting panel

#### Scenario: Empty line
- **WHEN** a person posts an empty line
- **THEN** the system refuses and no intent is made

### Requirement: A close intent is offered first
While a person types an intent, the panel SHALL offer the one open intent on the campus that shares an activity with the line (the same word group as tags) and has the most people in, with its title, its count, the faces of people in it as far as the viewer may see them, and "I'm in". Pressing "I'm in" SHALL put them in that intent instead of posting. They SHALL still be able to post their own. Nothing SHALL be merged automatically.

#### Scenario: Jogging finds running
- **WHEN** a person types "jogging along the river" and an intent "Run the island @running" with 3 in exists
- **THEN** the panel offers "Run the island", 3 in, with I'm in

#### Scenario: Nothing close
- **WHEN** a person types "learn to knit" and no open intent shares an activity
- **THEN** nothing is offered and Post posts their intent

### Requirement: Finding and joining an intent
Open intents SHALL be listed on the campus page with title, tags, count and "I'm in", and SHALL be found by search through their title and tags. Each intent SHALL have its own page that works as a share link. Any signed-in person SHALL be able to press "I'm in" on an intent and "Leave" once in. An intent with nobody left in it SHALL close and leave the campus. A signed-out visitor SHALL see the title and the count, and a sign-in that brings them back to join.

#### Scenario: Joining
- **WHEN** a signed-in person presses I'm in on "Run the island"
- **THEN** they are in it, the count goes up by one, and they see its open proposals

#### Scenario: Last one leaves
- **WHEN** the only person in an intent leaves it
- **THEN** the intent is no longer on the campus or in search

### Requirement: Proposing a time and place
A person in an intent SHALL be able to propose a day, a time and a place for it. All three SHALL be required; Send SHALL stay off until they are picked. On a campus where places are required the place SHALL be a known place, as for plans. The day SHALL be within the next 14 days and the time still ahead. A proposal SHALL be a plan in the campus list and on the map, titled with the intent, with the proposer going. Several proposals MAY stand on one intent at once. A proposal SHALL count toward the proposer's three upcoming plans. A person not in the intent SHALL NOT be able to propose.

#### Scenario: Thursday at 7am
- **WHEN** a person in "Run the island" proposes Thu 27, 7am, Southpoint Park
- **THEN** a plan "Run the island" stands on Thursday's map at Southpoint Park at 7am with 1 going

#### Scenario: No place
- **WHEN** a person picks a day and a time but no place
- **THEN** Send cannot be pressed

#### Scenario: Not in the intent
- **WHEN** a person who is not in an intent tries to propose for it
- **THEN** the system refuses

### Requirement: A proposal is silent about who made it
No one other than the admin SHALL be shown who made a proposal: not on its card, its map stamp, its details, the ask card or the ask email. The stamp SHALL show the time and the going count, not a face. The proposer SHALL be able to cancel their own proposal from its details; nobody else except the admin SHALL be able to.

#### Scenario: Cristian sees the proposal
- **WHEN** Alex proposes Thu 27 at 7am and Cristian opens the ask
- **THEN** it reads "Run the island: Thu 27 at 7am, Southpoint Park" and Alex's name appears nowhere on it

#### Scenario: Cancel own proposal
- **WHEN** the proposer presses "Cancel this proposal" and confirms
- **THEN** the proposal leaves the list, the map and every ask card

### Requirement: Everyone in is asked
A new proposal SHALL ask every person in the intent except the proposer, once: by email and as a card at the top of the campus page. The ask SHALL offer "Going" and "Can't". The card SHALL show while the proposal is ahead and the person has not answered. A person who joins the intent later SHALL see the open proposals as cards and SHALL NOT be emailed about them. Each ask email SHALL carry "Leave this intent". No ask email SHALL be sent while asks sending is off.

#### Scenario: Asked once
- **WHEN** a proposal is made on an intent with four people in
- **THEN** the three others each get one email and one card, and the proposer gets neither

#### Scenario: Joining late
- **WHEN** a person joins an intent with one open proposal
- **THEN** they see the proposal's card and get no email for it

#### Scenario: Leave from the email
- **WHEN** a person presses "Leave this intent" in an ask email
- **THEN** they are out of the intent and get no more asks from it

### Requirement: Going, Can't and it's on
"Going" SHALL put the person in the proposal's one outing for the intent; "Can't" SHALL take them out of it and record that they can't. Either SHALL hide the ask card. A proposal SHALL show "It's on" and a lit date tile once two people are going, the proposer counting. Below that it SHALL show "on at 2". A proposal that is on SHALL be an outing as any other, with invite and check-in. The intent SHALL stay open after its proposals pass.

#### Scenario: Second person going
- **WHEN** Cristian presses Going on a proposal the proposer is going to
- **THEN** it shows 2 going and "It's on" for everyone who can see it

#### Scenario: Changing to Can't
- **WHEN** a going person presses Can't
- **THEN** they are out of its outing, and if one person is left it shows "on at 2" again

### Requirement: Matching events become proposals
An event on the campus that is shown (not waiting for review, hidden or cancelled), has a known place, starts at least an hour ahead and within 14 days, and shares an activity with an open intent on that campus, SHALL be added to that intent as a proposal marked with its source (the feed or the site its link is on), and everyone in SHALL be asked as for any proposal. Activities SHALL come from the fixed word table, without a model; broad words such as exercise, social, food or game SHALL NOT match. An intent SHALL get at most one matched proposal in 24 hours, and the same event at most once. Matching SHALL happen after a feed is read, when the admin shows a waiting event, when an event link is posted, and once when an intent is posted.

#### Scenario: The Saturday 5K
- **WHEN** a Luma calendar feed brings "Saturday 5K at Southpoint", Sat 9am, at Southpoint Park, and "Run the island @running" is open
- **THEN** the intent gets a proposal "Saturday 5K at Southpoint" marked Luma, and everyone in it is asked

#### Scenario: Waiting for review
- **WHEN** a CampusGroups run waits for the admin's review
- **THEN** it is not matched until the admin shows it

#### Scenario: A broad word only
- **WHEN** a "Startup social" event comes in and the only open intent is "Board games @boardgames"
- **THEN** no proposal is made

#### Scenario: Two runs on one day
- **WHEN** two matching runs come in within the same 24 hours
- **THEN** only the first becomes a proposal on the intent

### Requirement: A line with a time and a place
When the posted line also names a time and a place, the system SHALL post the intent and its first proposal together. When it names only one of them, the system SHALL post the intent and open Propose with that one filled in.

#### Scenario: Everything in the line
- **WHEN** a person posts "run @southpoint thu 7am"
- **THEN** an intent "run" is posted with a proposal on Thursday at 7am at Southpoint Park, and they are going

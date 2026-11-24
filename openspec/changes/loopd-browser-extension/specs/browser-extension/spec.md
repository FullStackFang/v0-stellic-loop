## ADDED Requirements

### Requirement: A card on event pages of four sites
The extension SHALL show one Loopd card on a single-event page of Luma, Posh, Eventbrite and CampusGroups, and on no other page. The card SHALL sit on top of the page in a corner and SHALL NOT change the page.

#### Scenario: A Luma event
- **WHEN** a person with the extension opens a Luma event page
- **THEN** the Loopd card appears in the corner

#### Scenario: Another page of the same site
- **WHEN** the person opens Luma's home page or a search page
- **THEN** no card appears and nothing is sent to Loopd

#### Scenario: Another site
- **WHEN** the person opens any site not on the list
- **THEN** the extension does nothing

### Requirement: What it sends
The extension SHALL send Loopd the address of the event page and the person's extension token, and nothing else from the page or the browser. It SHALL send only when the page is a single-event page of a listed site.

#### Scenario: The request
- **WHEN** the card looks up an event
- **THEN** the request holds the page address and the token, and no page text, no cookies of the other site and no history

### Requirement: The same event by its address
The system SHALL recognise an event by its page address with the host in lower case and `www.`, the query, the fragment and a trailing slash removed, matched exactly against plans posted with that link and feed events that came from that page, on the person's campus.

#### Scenario: Tracking words on the address
- **WHEN** the page address carries `?utm_source=...`
- **THEN** it is recognised as the same event as the address without it

#### Scenario: A different event
- **WHEN** the address differs in its path
- **THEN** it is not matched to that event

### Requirement: People you know are in
For a connected person on a recognised event, the card SHALL show the faces and first names of people they know who are in, those they have been out with most first, a count of other students going, an "I'm in" control and an "Invite" control. It SHALL NOT show the name or face of anyone the person does not know.

#### Scenario: Three known, eight not
- **WHEN** three people the person knows and eight others are in
- **THEN** the card names and shows the three and says how many other students are going

#### Scenario: Nobody they know
- **WHEN** only people the person does not know are in
- **THEN** the card says nobody they know is in yet and shows no names or faces

### Requirement: I'm in from the card
Pressing "I'm in" SHALL put the person in an outing for the event exactly as pressing it in Loopd does. The card SHALL then show their face with the group's, the outing's share link with a copy control, "Invite", which opens Loopd, and "Leave". It SHALL NOT register the person on the other site and SHALL NOT say it has.

#### Scenario: Joining friends
- **WHEN** a person presses "I'm in" on an event where people they know have an outing
- **THEN** they are in that outing and the card shows the group

#### Scenario: Leaving
- **WHEN** a person who has not checked in presses "Leave"
- **THEN** they are out of the outing and the card returns to its earlier state

#### Scenario: Wording
- **WHEN** a person has pressed "I'm in" on a ticketed event
- **THEN** the card does not say they are registered or have a ticket

### Requirement: An event Loopd has not seen
When the page is not recognised, the card SHALL say so and SHALL offer "I'm in". Pressing it SHALL add the event to the person's campus as a plan with that link, by the same reading and the same rules as pasting the link into a plan in Loopd, and SHALL put the person in it. Where the campus requires a listed place and none matches, the control SHALL read "Finish in Loopd" and SHALL open Loopd's posting panel with the link filled in. A refusal SHALL be shown on the card in Loopd's own words.

#### Scenario: A new Posh event
- **WHEN** a person presses "I'm in" on a Posh event nobody has added
- **THEN** a plan with that link exists on their campus, with the page's title and time, and they are in it

#### Scenario: Someone added it a moment ago
- **WHEN** two people press "I'm in" on the same new event
- **THEN** one plan exists and both are in it

#### Scenario: Too many plans
- **WHEN** the person already has the most plans allowed
- **THEN** nothing is added and the card says why

#### Scenario: A place is required
- **WHEN** the campus requires a listed place and the page's place matches none
- **THEN** the control reads "Finish in Loopd" and opens the posting panel with the link filled in

### Requirement: Not connected
For a person whose extension is not connected, the card SHALL show no names and no faces. It SHALL show how many students are going only when the event is a public one, and one control to sign in with a school email, which opens the connect page.

#### Scenario: A public feed event
- **WHEN** a person who is not connected opens the page of a feed event seven students are in
- **THEN** the card says seven students are going and offers sign-in

#### Scenario: A posted plan
- **WHEN** a person who is not connected opens a page that only a posted plan links to
- **THEN** the card shows no count and offers sign-in

#### Scenario: No school
- **WHEN** a connected person has no campus
- **THEN** the card shows no people and says what Loopd says to a person with no school

### Requirement: Connecting and disconnecting
A signed-in person SHALL connect the extension by pressing Connect on Loopd's connect page, which gives the extension a token of its own. The person SHALL be able to see that it is connected and disconnect it from their account card, after which the token SHALL be refused. The token SHALL allow only looking up an event, "I'm in" and "Leave".

#### Scenario: Connect
- **WHEN** a signed-in person presses Connect
- **THEN** the card on the next event page shows people they know

#### Scenario: Disconnect
- **WHEN** the person presses Disconnect in their account card
- **THEN** the card on the next event page is in its not-connected state

#### Scenario: A revoked token
- **WHEN** a request arrives with a revoked or unknown token
- **THEN** the answer holds no people and no person's count beyond the public one

### Requirement: The page cannot read the card
The card SHALL be drawn so the page it sits on cannot read its contents, and the token SHALL never be available to the page.

#### Scenario: The page's own script
- **WHEN** a script of the page looks for the card's contents or the token
- **THEN** it finds neither

### Requirement: Putting the card away
The card SHALL carry a close control that hides it on that page, and the extension's toolbar button SHALL bring it back.

#### Scenario: Close
- **WHEN** a person presses the close control
- **THEN** the card is gone from that page until they press the toolbar button or load the page again

### Requirement: Works before the migration
Before the extension's tables exist, the connect page SHALL say the extension is not set up yet, and every lookup SHALL answer as not connected with no count.

#### Scenario: Tables missing
- **WHEN** the migration has not been run and the card looks up an event
- **THEN** it shows the not-connected state with no count

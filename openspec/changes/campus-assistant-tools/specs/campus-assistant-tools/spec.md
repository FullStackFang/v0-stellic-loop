## ADDED Requirements

### Requirement: Five tools for going out
The system SHALL offer an assistant connection for the campus side with exactly five tools: `find`, `whos_in`, `interested`, `join` and `close_loop`. It SHALL be separate from the team connection, which SHALL keep its tools unchanged.

#### Scenario: Listing the tools
- **WHEN** an assistant connects to the campus address and lists tools
- **THEN** it receives those five and no others

#### Scenario: The team connection
- **WHEN** an assistant lists the team connection's tools after this change
- **THEN** they are the same as before

### Requirement: A school email is needed
Every tool SHALL work only for a person who has a campus. For anyone else it SHALL answer that a school email is needed and give the sign-in address, and SHALL return no events and no people.

#### Scenario: No campus
- **WHEN** a person with a non-school email calls `find`
- **THEN** the answer says a school email is needed and lists nothing

### Requirement: Find what is on
`find` SHALL return up to eight events from the person's campus for today, tonight, tomorrow or the week, ranked as the campus screen ranks them, each with title, time, place, how many are going, the first names of people the person knows who are going, and whether the person is in or interested. It SHALL change nothing.

#### Scenario: Tonight
- **WHEN** a person's assistant calls `find` for tonight
- **THEN** it receives tonight's events with counts, and first names only of people the person knows

#### Scenario: A deal outside its hours
- **WHEN** a deal at a place is not running now
- **THEN** `find` does not list it

### Requirement: Who is in
`whos_in` SHALL return, for one event, the first names of people the person knows who are going, those they have been out with most first, and a count of everyone else. It SHALL NOT return the name, face or any detail of a person the caller does not know.

#### Scenario: Two known, four not
- **WHEN** Dev and Noor, whom the person knows, and four strangers are going
- **THEN** the answer names Dev and Noor and says four others are going

#### Scenario: Only strangers
- **WHEN** nobody the person knows is going
- **THEN** the answer is a count and no names

### Requirement: Interested is private until it matches
`interested` SHALL mark or unmark an event for the person without a tap. The mark SHALL be visible to nobody else, with one exception: when two people who know each other have both marked the same event, `find` and `whos_in` SHALL tell each of them that the other is interested. Joining the event SHALL remove the person's mark.

#### Scenario: Marking
- **WHEN** a person's assistant calls `interested` on an event
- **THEN** the event is marked for them and nobody else can see it

#### Scenario: A match
- **WHEN** Ana and Dev know each other and both have marked the same event
- **THEN** Ana's `whos_in` says Dev is interested too, and Dev's says the same of Ana

#### Scenario: No match with a stranger
- **WHEN** Ana and a person she does not know have both marked the same event
- **THEN** neither is told about the other

#### Scenario: Unmarking
- **WHEN** the assistant calls `interested` with it turned off
- **THEN** the mark is removed

### Requirement: Joining needs the person's tap
`join` called by an assistant SHALL NOT put the person in an outing. It SHALL return a button for the person to press, saying which event and which people they would be with, and a link that performs the same step in Loopd. Only the press, on the card or on that page, SHALL join them. The press SHALL be accepted once, for ten minutes, and only from the person it was made for.

#### Scenario: The assistant asks to join
- **WHEN** an assistant calls `join` for an event
- **THEN** the person is in no outing, and the answer carries the button and the link

#### Scenario: The person presses Join
- **WHEN** the person presses Join on the card within ten minutes
- **THEN** they are in the outing that "I'm in" would have picked, and the card says so

#### Scenario: The link in place of the card
- **WHEN** the person opens the link while signed in to Loopd and presses Join there
- **THEN** they are in the outing

#### Scenario: Opening the link does nothing alone
- **WHEN** the link is opened and no button is pressed
- **THEN** the person is in no outing

#### Scenario: Too late
- **WHEN** the button is pressed after ten minutes
- **THEN** nothing is joined and the answer says to ask again

#### Scenario: Pressed twice
- **WHEN** the button is pressed a second time
- **THEN** nothing more happens

#### Scenario: Someone else's button
- **WHEN** another signed-in person opens the link
- **THEN** the system refuses

#### Scenario: The assistant cannot press it
- **WHEN** the answer to `join` is read as text or as data
- **THEN** it does not hold the code the button sends

### Requirement: Closing the loop needs the person's tap
`close_loop` SHALL be offered for an outing the person is in, once its event has started and the person has checked in. Called by an assistant it SHALL change nothing and SHALL return a button and a link, under the same rules as `join`. On the press, the outing SHALL be marked finished for that person, the answer SHALL say how many of the group checked in, and the outing SHALL no longer be listed as open by `find`.

#### Scenario: Not checked in
- **WHEN** the assistant calls `close_loop` for an outing the person has not checked in on
- **THEN** the answer says to check in on the phone first, and offers no button

#### Scenario: Closing
- **WHEN** the person presses Close the loop on the card
- **THEN** the outing is finished for them and the answer says how many checked in

#### Scenario: The assistant alone
- **WHEN** the assistant calls `close_loop` and nobody presses the button
- **THEN** nothing is marked finished

### Requirement: No tool checks in
No tool on the campus connection SHALL check a person in, invite a person, post a plan, or send a message.

#### Scenario: Asked to check in
- **WHEN** a person asks their assistant to check them in
- **THEN** no tool can do it, and `join` and `close_loop` answers say check-in is done on the phone

### Requirement: The card
The tools SHALL declare an in-chat card in the look of the team card: a plate header, rows with small faces, pill buttons. The card SHALL load and embed nothing from outside itself and SHALL stay within the team card's size limit. Every answer SHALL also be complete as plain text for an assistant that draws no cards.

#### Scenario: An assistant with no cards
- **WHEN** `find` is called by an assistant that draws no cards
- **THEN** the text alone lists the events, the counts and the known first names

### Requirement: Works before the migration
Before the campus assistant tables exist, every tool SHALL answer that going-out tools are not set up yet, and the Assistants page SHALL NOT list the campus address.

#### Scenario: Tables missing
- **WHEN** the migration has not been run and an assistant calls `find`
- **THEN** it receives the not-set-up answer and no error

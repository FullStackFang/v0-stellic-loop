## ADDED Requirements

### Requirement: Which events are public
An event SHALL be public only when it came from a feed or was entered by the admin, is not a deal's day, is not hidden, cancelled, waiting for review or gone from its feed, and has not ended. A plan posted by a person SHALL never be public.

#### Scenario: A feed event
- **WHEN** a feed event the admin has shown starts on Thursday
- **THEN** it has a public page and is listed on its place's public page

#### Scenario: A posted plan
- **WHEN** a student posts a plan at the same place
- **THEN** it is on no public page, in no ask answer and in no sitemap

#### Scenario: Waiting for review
- **WHEN** a feed event is waiting for the admin's review
- **THEN** it is not public

#### Scenario: A deal's day
- **WHEN** a deal is running at the place today
- **THEN** it is not on the public page

### Requirement: A public page for a place
The system SHALL serve, without sign-in, a page for each place that has a public event in the next 14 days or a record made public. The page SHALL show the place's name, its campus, its public events for the next seven days with day, time, title, host or source name and how many are going, and the record's three numbers when the record is public. A place with neither SHALL respond with not found.

#### Scenario: A place with events
- **WHEN** a signed-out visitor opens the page of a place with three public events this week
- **THEN** they see the three events, each with its count, and no sign-in is asked for

#### Scenario: A place with nothing on
- **WHEN** a visitor opens the address of a place with no public event and no public record
- **THEN** the system responds with not found

#### Scenario: Public record
- **WHEN** the admin has made the place's record public
- **THEN** the page shows how many groups showed up and how many came back

### Requirement: A public page for an event
The system SHALL serve, without sign-in, a page for each public event with its title, day and time, place, host or source name, about text and how many are going. It SHALL NOT link to the source's page. An event that is not public SHALL respond with not found.

#### Scenario: Open a public event
- **WHEN** a visitor opens the page of a public feed event
- **THEN** they see its facts and its count, with the source named and no link that leaves Loopd

#### Scenario: Ended
- **WHEN** a visitor opens the page of an event that has ended
- **THEN** the system responds with not found

### Requirement: Nothing about people
Public pages, the guide file, the ask address and the sitemap SHALL NOT contain any person's name, first name, face, photo, email or id, who posted anything, who is going, or any group. They SHALL NOT contain an admin's private note.

#### Scenario: Reading a place page
- **WHEN** the page of a place where people the visitor knows are going is fetched signed out
- **THEN** the response holds counts only

#### Scenario: Signed in makes no difference
- **WHEN** a signed-in person opens a public page
- **THEN** it shows the same counts and no faces

### Requirement: The way in is a school email
Each public page SHALL carry one bar saying that signing in with a school email shows who the visitor knows and lets them go, with a Sign in control that returns them to the campus screen.

#### Scenario: Pressing Sign in
- **WHEN** a visitor presses Sign in on a place page
- **THEN** they are sent to sign in and afterwards land on that campus's screen

### Requirement: Readable by a machine
Each public page SHALL deliver every fact it shows in its first HTML response, with no script needed, and SHALL carry structured data naming the place or the event.

#### Scenario: Fetched with no script
- **WHEN** a client that runs no script fetches an event page
- **THEN** the title, time, place and count are in the response

### Requirement: The guide file
The system SHALL serve `/llms.txt` as plain text stating what Loopd is, the campuses it covers, the address patterns of the public pages, the ask address and its parameters, and what will not be found there.

#### Scenario: Fetching the guide
- **WHEN** a client fetches `/llms.txt`
- **THEN** it receives plain text that names every campus and the ask address

#### Scenario: A new campus
- **WHEN** the admin adds a campus
- **THEN** the guide file names it without a code change

### Requirement: One address to ask
The system SHALL answer `GET /api/ask` with JSON listing up to 20 public events near a campus, soonest first, each with title, start, place name, page address and how many are going. It SHALL accept `near` (a campus), `for` (a number of people) and `when` (today, tonight, tomorrow or week). It SHALL need no key and no sign-in. A value it does not know SHALL NOT cause an error.

#### Scenario: Tonight near a campus
- **WHEN** a client asks with `near=cornell-tech&for=4&when=tonight`
- **THEN** it receives the public events starting from 5pm today at that campus, with counts and page addresses

#### Scenario: Unknown campus
- **WHEN** a client asks with a campus that does not exist
- **THEN** it receives an empty list and the campuses that do exist

#### Scenario: No parameters
- **WHEN** a client asks with nothing
- **THEN** it receives the list of campuses and how to ask

### Requirement: Found by search
The system SHALL publish a sitemap listing every public place and event page and nothing else from the campus area, and its robots rules SHALL allow them. A private venue record SHALL NOT be in the sitemap.

#### Scenario: Sitemap
- **WHEN** a client fetches the sitemap
- **THEN** it lists the public place and event pages and no address under `/c/`

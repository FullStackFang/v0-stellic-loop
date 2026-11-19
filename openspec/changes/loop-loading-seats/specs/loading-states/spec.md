## ADDED Requirements

### Requirement: One loader, in two sizes
Every wait the app shows SHALL be drawn with the same loader, "Saving seats", in one of two sizes. The ticket SHALL be a ticket with four seats that fill one at a time with faces, and a stub that is stamped "It's on" once the seats are full, after which it starts again. The small one SHALL be three small faces that fill in one at a time and start again. Both SHALL take their colours from the school colours the page is showing. Pages on retired looks (`/emba`, `/b`, `/p`, `/trip`, `/trips`) are outside this requirement.

#### Scenario: The ticket on a Cornell page
- **WHEN** the ticket shows on a page wearing Cornell's colours
- **THEN** its stub is stamped in Cornell's action colour

#### Scenario: The same loader everywhere
- **WHEN** a person opens a campus page, opens a group page, and presses "I'm in"
- **THEN** each wait shows Saving seats, as the ticket or as the small one, and no other loading drawing

### Requirement: The loader always says the same thing
The ticket SHALL carry one line, and it SHALL be the same wherever the ticket shows: "Looping you in…". It SHALL NOT change with the page, the part or the action being waited for. The words "One moment…", "Reading…", "Saving…", "Opening…", "Finding you" as bare text, and "Loading sign-in…" SHALL no longer appear.

#### Scenario: A page the person chose
- **WHEN** a person presses the link "Near you" and the page is not ready
- **THEN** the ticket reads "Looping you in…"

#### Scenario: Opening the app cold
- **WHEN** a person opens a campus address directly
- **THEN** the ticket reads "Looping you in…"

#### Scenario: A part of a page
- **WHEN** Near you is finding where the person is
- **THEN** the ticket over the map reads "Looping you in…", the same as everywhere else

### Requirement: The faces on the loader
The seats SHALL be filled with animal faces from the app's own set. When the viewer is signed in and their face is known, the last seat of the ticket and the last face of the small one SHALL be the viewer's own face, whether it is an animal, a school animal, a pet drawn for them, or a photo. When it is not known, the last seat SHALL be an animal from the free set. The faces SHALL be the same on the server and in the browser for the same page view. A face SHALL never be a real person other than the viewer.

#### Scenario: A signed-in person with a picked animal
- **WHEN** a person whose face is the Cornell bear waits for a page after having seen one
- **THEN** the last seat fills with the Cornell bear

#### Scenario: A signed-out visitor
- **WHEN** a visitor who is not signed in waits for a campus page
- **THEN** all four seats fill with animals from the free set

### Requirement: Opening the app shows the ticket on the whole screen
When a campus page is opened with nothing on screen yet, the app SHALL show the ticket alone, centred, on the school's field colour, until the page is ready. It SHALL NOT show a blank page.

#### Scenario: A cold open
- **WHEN** a person opens `/c/cornell` in a new tab on a slow connection
- **THEN** the screen is the field colour with the ticket in the middle until the page arrives

### Requirement: Changing page keeps the bar
When a person moves from one campus page to another, the top bar SHALL stay as it was, with the same links, and the ticket SHALL take the place of the page under it until the new page is ready. The link that was pressed SHALL hold the small one from the press until the new page is ready. When a person moves between pages under `/groups`, the bar SHALL stay and the ticket SHALL show in the page's place.

#### Scenario: From This week to Ink
- **WHEN** a signed-in person on This week presses "Ink"
- **THEN** the bar keeps its links, "Ink" holds the small one, and the ticket shows under the bar until the Ink page is ready

#### Scenario: Moving to another campus
- **WHEN** a person presses the ticket of another campus of their school
- **THEN** the bar stays, the pressed ticket holds the small one, and the ticket shows under the bar

#### Scenario: Opening a team from the groups bar
- **WHEN** a member presses a team in the groups bar
- **THEN** the bar stays and the ticket shows in the page's place, where "Opening…" and grey bars showed before

### Requirement: A shared link shows the ticket
A page reached by a shared link (`/e`, `/a`, `/o`) SHALL show the ticket on the whole screen until it is ready.

#### Scenario: A friend opens an event link
- **WHEN** a person who is not signed in opens an event's shared link
- **THEN** the ticket shows until the event is drawn

### Requirement: The sign-in card shows the ticket while it loads
While the sign-in form is loading, the sign-in card on the front door and on `/groups/sign-in` SHALL show the ticket in the form's place, and the card SHALL keep its size when the form arrives.

#### Scenario: The front door on a slow connection
- **WHEN** a visitor opens the front door and the sign-in form has not loaded
- **THEN** the card shows the ticket, and the form replaces it without the card jumping

### Requirement: A late part of a page shows the ticket in its own place
When one part of a page is late and the rest is ready, the ticket SHALL show inside that part only, and the rest of the page SHALL stay usable. This covers Near you while it is finding where the person is, and the map on a ticket's detail until the map has loaded.

#### Scenario: Finding you
- **WHEN** a person on Near you presses the button to find where they are
- **THEN** the ticket shows over the map, the button holds the small one, and the list of what is on can still be used

#### Scenario: Location refused
- **WHEN** the browser refuses the location
- **THEN** the ticket goes and the page says the location is off, as it does today

#### Scenario: A ticket's map
- **WHEN** a person opens a ticket's detail and its map has not loaded
- **THEN** the map's box shows the ticket, and the ticket's facts and buttons above it can be used

### Requirement: A long wait fills one seat at a time
A wait the app knows to be long SHALL use the slow ticket: its seats fill over the expected length of the wait, and the last seat is ringed and stays empty until the answer arrives. Drawing a pet from a photo SHALL use it, with the words that it takes about half a minute. When the pet is ready it SHALL appear in the last seat before the finished pet is shown.

#### Scenario: Drawing a pet
- **WHEN** a person with Ink sends a photo of their pet
- **THEN** the slow ticket shows with its last seat ringed, and the page says it takes about half a minute

#### Scenario: The pet is ready
- **WHEN** the drawing comes back
- **THEN** the new pet fills the ringed seat, and then the page shows it with its usual choices

#### Scenario: The drawing fails
- **WHEN** the drawing does not come back
- **THEN** the ticket goes and the page says it did not go through, as it does today

### Requirement: A pressed button holds the small one
A button that starts work on the server SHALL show the small one inside itself from shortly after the press until the answer is back, and SHALL NOT be pressable in that time. Only the button that was pressed SHALL show it; other buttons that cannot be used meanwhile SHALL NOT. The button SHALL keep its height and SHALL NOT get narrower. This covers: I'm in, Join, Check in, Register me, Leave, Mark as used, inviting or un-inviting a person, Post it, Fill in, Save, changing campus, Subscribe, and Keep this one.

#### Scenario: I'm in
- **WHEN** a person presses "I'm in" on a ticket
- **THEN** that button shows the small one until the answer is back, and the "Join" button on another ticket does not

#### Scenario: Posting a plan
- **WHEN** a person presses "Post it"
- **THEN** the button shows the small one and the word "Posting", where it read "One moment…" before

#### Scenario: Reading a link
- **WHEN** a person pastes an event link and presses "Fill in"
- **THEN** that button shows the small one and the word "Reading", and "Post it" beside it does not

#### Scenario: The answer is an error
- **WHEN** the action fails
- **THEN** the small one goes, the button can be pressed again, and the error shows as it does today

### Requirement: Picking a face shows the small one on that face
When a person picks a face, the picked face SHALL show the small one beside it until the pick is saved. If the save fails the picker SHALL go back to the face before, as it does today.

#### Scenario: A pick on a slow connection
- **WHEN** a person picks the penguin and the save takes a second
- **THEN** the penguin is ringed at once and holds the small one until the save is back

### Requirement: A fast answer shows no loader
The loader SHALL NOT appear for a wait shorter than 150 milliseconds, so a fast page or a fast action does not flash it.

#### Scenario: A fast page
- **WHEN** a page is ready 80 milliseconds after the press
- **THEN** no loader is shown

#### Scenario: A fast action
- **WHEN** an action answers 80 milliseconds after the press
- **THEN** the button never shows the small one

### Requirement: Still under reduced motion
When the person has asked for reduced motion, the loader SHALL NOT move: the ticket SHALL stand with its seats full and its stub stamped, the small one with its three faces shown, and the line SHALL still be shown.

#### Scenario: Reduced motion on a cold open
- **WHEN** a person with reduced motion set opens a campus page
- **THEN** the ticket shows with four faces and a stamped stub, not moving, reading "Looping you in…"

### Requirement: The wait is announced once
Each wait SHALL be announced to a screen reader once, with the loader's line or, for a button, the button's waiting word. The faces SHALL be hidden from screen readers. A page change that shows both the small one on the link and the ticket in the page SHALL be announced once, not twice.

#### Scenario: A page change with a screen reader
- **WHEN** a screen reader user presses "Near you"
- **THEN** "Looping you in" is announced once

#### Scenario: A button with a screen reader
- **WHEN** a screen reader user presses "Post it"
- **THEN** "Posting" is announced once and no face is read out

## ADDED Requirements

### Requirement: The app's font is one compressed file
Every page of the app SHALL load the Archivo font as a single WOFF2 file of at most 190 kB, holding the same weight range (100 to 900) and width range (62% to 125%) as before. A page SHALL NOT fetch a second copy of the font, from the app or from another site, including inside a frame the page shows.

#### Scenario: A first visit to any page
- **WHEN** a visitor with an empty cache opens a page
- **THEN** exactly one font file is downloaded, it is WOFF2, and it is at most 190 kB

#### Scenario: The Ink page and the organizers page
- **WHEN** a visitor opens `/c/ink` or `/organizers`
- **THEN** the framed page draws its text with the app's font file and no request is made to a font host outside the app

#### Scenario: Wide and condensed text
- **WHEN** a page draws a wide headline and a condensed label
- **THEN** both are drawn in Archivo at their own widths, as before

### Requirement: Animal faces are served as WebP
Every animal face from the app's own set SHALL be served as a WebP picture of the same pixel size as its PNG, with its transparent ground kept. Every PNG in the set SHALL have a WebP made from its current drawing.

#### Scenario: A face on a page
- **WHEN** a page draws a person's animal from the set
- **THEN** the picture's address ends in `.webp`

#### Scenario: A face is redrawn
- **WHEN** a PNG in the set is replaced and its WebP is not made again
- **THEN** a test fails and names the face

#### Scenario: A person's own animal
- **WHEN** a person has their own animal drawn from one of the set
- **THEN** the drawing still starts from that animal's PNG

### Requirement: Terms and Privacy are the same for everyone and are not rendered per visit
The Terms and Privacy pages SHALL be built once and served without rendering on each request. They SHALL NOT read who is signed in and SHALL NOT load sign-in scripts.

#### Scenario: Two visitors open Terms
- **WHEN** a signed-out visitor and a signed-in member each open `/terms`
- **THEN** both receive the same page, and it is served from the cache in front of the app

#### Scenario: Scripts on a legal page
- **WHEN** a visitor opens `/privacy`
- **THEN** no script from the sign-in provider is requested

### Requirement: The signed-out pitch reads its example tickets at most once a minute
The data behind the front door's example tickets (each school's event and reward words) SHALL be read from the database at most once in any minute, however many visitors open the front door. That data SHALL hold no person's name, picture or count of friends. Whether a visitor is signed in SHALL still be checked on every request.

#### Scenario: Many visitors in one minute
- **WHEN** twenty signed-out visitors open `/` within a minute
- **THEN** the schools' weeks and rewards are read once

#### Scenario: A signed-in member opens the front door
- **WHEN** a member with a campus opens `/` while the pitch's data is being kept
- **THEN** they are sent on to their campus, as before

#### Scenario: An event is cancelled
- **WHEN** the event on a school's example ticket is cancelled
- **THEN** the pitch stops showing it within a minute

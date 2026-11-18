## ADDED Requirements

### Requirement: The campus screen is the front door
When the environment flag `LOOP_FRONT` is set to `campus`, the system SHALL make the campus app the front door at `/`: a signed-out visitor sees the sign-in door, and a signed-in person is sent to the campus screen of their own school. When the flag is not set, `/` SHALL behave as it does today.

#### Scenario: Flag on
- **WHEN** the flag is on and a signed-in person opens `/`
- **THEN** they see the campus screen of their school

#### Scenario: Flag on, signed out
- **WHEN** the flag is on and a signed-out visitor opens `/`
- **THEN** they see the sign-in door

#### Scenario: Flag off
- **WHEN** the flag is not set and a visitor opens `/`
- **THEN** they are sent to the groups site as today

### Requirement: The groups site opens for the admin only
When the flag is on, the system SHALL open the groups site only for the admin: `/groups` and every page under it, including the "How we got here" archive, and the other pages of the current site that lead into groups. Any other visitor, signed in or not, SHALL be sent to `/`. The check SHALL be made both before the page is routed and again on the server when the page is rendered.

#### Scenario: The admin opens groups
- **WHEN** the admin opens `/groups`
- **THEN** the groups site works as it does today

#### Scenario: A teammate opens a group page
- **WHEN** a signed-in member of a group who is not the admin opens that group's page
- **THEN** they are sent to the campus screen and see nothing of the group

#### Scenario: Signed out
- **WHEN** a signed-out visitor opens `/groups/archive`
- **THEN** they are sent to the campus screen

#### Scenario: A share link to a team event
- **WHEN** a person who is not the admin opens a team event's share link
- **THEN** they are sent to the campus screen

#### Scenario: A server action called directly
- **WHEN** a person who is not the admin calls a groups action without going through a page
- **THEN** the system refuses

### Requirement: One admin, named by configuration
The admin SHALL be whoever is listed in the environment variable `LOOP_ADMIN`, by sign-in account id or email address. With the variable empty, nobody SHALL be the admin. The system SHALL NOT offer a way to become admin inside the app.

#### Scenario: Listed account
- **WHEN** the signed-in account's email is listed in `LOOP_ADMIN`
- **THEN** that person is the admin

#### Scenario: Empty list
- **WHEN** `LOOP_ADMIN` is empty and the flag is on
- **THEN** nobody can open the groups site or the campus admin page

### Requirement: The admin's way in
The admin SHALL sign in through the same sign-in as everyone else. Once signed in, the admin SHALL see an "Admin" entry on their avatar's card with links to the campus admin page, the groups site and "How we got here". Nobody else SHALL see that entry.

#### Scenario: Admin signs in
- **WHEN** the admin signs in from the campus screen and opens their avatar's card
- **THEN** they see "Admin" with links to the campus admin page, the groups site and "How we got here"

#### Scenario: Student signs in
- **WHEN** a student signs in and opens their avatar's card
- **THEN** there is no "Admin" entry

### Requirement: What stays open
With the flag on, the system SHALL keep open to everyone: sign-in, the privacy and terms pages, the campus routes, and the routes that scheduled jobs and members' assistants use. Turning the flag off SHALL restore the groups site to its members with no data changed.

#### Scenario: Sign-in still works
- **WHEN** a signed-out visitor presses "Sign in" on the campus screen
- **THEN** they can sign in and are returned to the campus screen

#### Scenario: An assistant's connection
- **WHEN** a member's assistant calls Loop for an existing group while the flag is on
- **THEN** the call is handled as it is today

#### Scenario: Turning it back
- **WHEN** the flag is removed and the app is redeployed
- **THEN** members can open their group pages again and nothing they had is missing

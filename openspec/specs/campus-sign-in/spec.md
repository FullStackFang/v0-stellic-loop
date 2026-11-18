# campus-sign-in Specification

## Purpose
TBD - created by archiving change loop-campus-rewards. Update Purpose after archive.
## Requirements
### Requirement: Loop starts at four schools
The system SHALL hold a campus for each of Cornell, Columbia, NYU and CUNY, each with a name, a slug, a timezone and one or more email domains (`cornell.edu`, `columbia.edu`, `nyu.edu`, `cuny.edu`). Adding a school SHALL be a matter of adding a campus and its domains, with no change to code.

#### Scenario: The four schools exist
- **WHEN** the migration has run
- **THEN** the four campuses exist with their domains

#### Scenario: Each school has its own list
- **WHEN** a person at NYU opens their campus screen
- **THEN** they see NYU's events, plans and rewards and none from another school

### Requirement: One sign-in door
The system SHALL show signed-out visitors one sign-in screen with a short pitch, a few sample events, and a sign-in card that offers "Continue with Google" and an email field with a "Continue" button. There SHALL be no separate admin sign-in.

#### Scenario: Signed out at the front door
- **WHEN** a signed-out visitor opens `/`
- **THEN** they see the pitch, sample events and the sign-in card

#### Scenario: The admin signs in at the same door
- **WHEN** the admin signs in on the sign-in card
- **THEN** they land on a campus screen with the Admin link, and no other person sees that link

### Requirement: The school follows the email
The sign-in card SHALL show a school menu listing the four schools. As the visitor types an email address, the card SHALL switch the menu, its title and its email label to the school whose domain the address ends in, counting subdomains (`stern.nyu.edu` is NYU, `baruch.cuny.edu` is CUNY), and SHALL say that it switched. The visitor MAY also pick the school from the menu.

#### Scenario: An NYU address
- **WHEN** the visitor types `name@stern.nyu.edu`
- **THEN** the card shows NYU as the school and says the address is NYU

#### Scenario: Picking by hand
- **WHEN** the visitor picks Columbia from the menu
- **THEN** the card's title and email label name Columbia

#### Scenario: An address from no school
- **WHEN** the visitor types an address whose domain belongs to none of the schools
- **THEN** the card names the schools Loop is at and asks for a school email

### Requirement: A person belongs to the school of their email
After sign-in the system SHALL place the person at the campus whose domain their verified email ends in, whatever the menu showed, and SHALL send them to that campus's screen. This applies to Google sign-in as well. A person whose verified email matches no school SHALL NOT be placed at a campus and SHALL be told which schools Loop is at; the admin is the exception and MAY open any campus.

#### Scenario: Google sign-in with a school account
- **WHEN** a person continues with a Google account at `columbia.edu`
- **THEN** they land on Columbia's campus screen

#### Scenario: The menu and the email disagree
- **WHEN** a person picks Cornell in the menu and signs in with a verified `nyu.edu` address
- **THEN** they are placed at NYU

#### Scenario: Not a school address
- **WHEN** a person signs in with a verified address at no school's domain and is not the admin
- **THEN** they see which schools Loop is at and no campus screen

#### Scenario: The admin moves between schools
- **WHEN** the admin opens another school's campus screen
- **THEN** it opens


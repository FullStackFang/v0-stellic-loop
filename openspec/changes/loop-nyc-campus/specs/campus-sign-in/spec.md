## MODIFIED Requirements

### Requirement: A person belongs to the school of their email
After sign-in the system SHALL find the school whose domain the person's verified email ends in, whatever the menu showed. When that school has one campus the system SHALL place the person there and SHALL send them to that campus's screen. When that school has more than one campus the system SHALL NOT place the person by email alone and SHALL ask them which campus; a person already placed SHALL stay where they are. This applies to Google sign-in as well. A person whose verified email matches no school SHALL NOT be placed at a campus and SHALL be told which schools Loop is at; the admin is the exception and MAY open any campus.

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

#### Scenario: A school with two campuses
- **WHEN** a person signs in for the first time with a verified `cornell.edu` address
- **THEN** they are not placed and are asked which Cornell campus

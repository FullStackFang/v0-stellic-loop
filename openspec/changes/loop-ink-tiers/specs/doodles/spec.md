## MODIFIED Requirements

### Requirement: With Ink+ your own animal plays Seats
For a signed-in person with Ink or Ink+, one of their own animals SHALL take a place in the crowd, marked with a spark, and they SHALL be able to choose which of their animals it is. The choice SHALL be kept in the browser. Anyone else SHALL be shown a link saying that Ink gives this, and SHALL play with the crowd as it is.

#### Scenario: Someone with Ink opens Seats
- **WHEN** a person with Ink, or with Ink+, opens Seats
- **THEN** one of their own animals is in the crowd with a spark, and a "You" pill shows it

#### Scenario: They choose another
- **WHEN** they press "You" and pick another of their animals
- **THEN** that animal takes the place, a new round starts, and it is the one next time

#### Scenario: Their animal is already in the crowd
- **WHEN** the animal they chose is one the crowd already has
- **THEN** it is in the crowd once

#### Scenario: Someone without Ink
- **WHEN** a person with neither plan, or signed out, opens Seats
- **THEN** a pill reads "Ink Play as your own animal" and leads to the Ink page

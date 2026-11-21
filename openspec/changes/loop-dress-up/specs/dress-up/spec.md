## ADDED Requirements

### Requirement: Start from another pet (Ink+)
In "Create your own", a person on Ink+, or the admin, SHALL be offered "Start from another pet" next to the photo upload. They pick a base, say what should change (one line, up to 60 letters, required), confirm, and a new animal is drawn from the base with that change. It is made the same way a pet from a photo is: it becomes their own animal and their face.

#### Scenario: A scarf on the Dachshund
- **WHEN** a person on Ink+ picks the Dachshund, writes "add a red scarf" and confirms
- **THEN** one picture is drawn from the Dachshund alone, with no photo, and the result is their own animal and their face

#### Scenario: Nothing said
- **WHEN** they leave the line empty
- **THEN** nothing is drawn and they are told "Say what should change."

#### Scenario: Shown without Ink+
- **WHEN** a person without Ink+ opens "Create your own"
- **THEN** "Start from another pet" is still offered, marked Ink+, and the step it opens shows the animals and "Get Ink+ · $9.99" where the drawing would be

#### Scenario: Not on Ink+
- **WHEN** a person without Ink+ asks the server to start from another pet
- **THEN** nothing is drawn and they are told "Starting from another pet comes with Ink+."

### Requirement: Which animals can be a base
A person SHALL be able to start from one of their own made animals while it is theirs alone (the admin has not put it in a tier), or from an Ink (premium) animal, shipped or made. A made animal the admin moved to Core, School or Off SHALL NOT be a base, even for the person who made it. They SHALL NOT be able to start from a core animal, a school's own animal (a mascot), an animal that is off, or someone else's made animal. The admin SHALL be able to start from any animal. The server SHALL check this, not only the page.

#### Scenario: Own animal
- **WHEN** a person on Ink+ starts from an animal they made
- **THEN** it is drawn

#### Scenario: Core, mascot, someone else's
- **WHEN** a person on Ink+ asks for the fox, the Cornell bear, or another person's made animal
- **THEN** nothing is drawn and they are told "That one can’t be drawn again. Pick one of your own pets, or an Ink one."

#### Scenario: Admin
- **WHEN** the admin opens "Start from another pet"
- **THEN** every animal is offered

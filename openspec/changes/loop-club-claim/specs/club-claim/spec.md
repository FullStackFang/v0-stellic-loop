## ADDED Requirements

### Requirement: A club is claimed by its CampusGroups link
The claim page at `/organizers/claim` SHALL take one link, to a club's own page on a school's CampusGroups site, from a signed-in person. A signed-out visitor SHALL be shown a pill to sign in with their school email and no box. A link to anything else SHALL be refused without any request being made to it.

#### Scenario: Signed out
- **WHEN** a signed-out visitor opens the claim page
- **THEN** they see "Sign in with your school email" and "What you get", and no box to paste into

#### Scenario: A link however it was pasted
- **WHEN** a signed-in person pastes `cornell.campusgroups.com/skiclub`, or the club's officers page, with or without `https://`
- **THEN** it is taken as that club

#### Scenario: Not a club link
- **WHEN** they paste a link to another site, or a CampusGroups address with no club in it
- **THEN** they are told to paste their club's CampusGroups link, and nothing is requested or kept

#### Scenario: The page cannot be read
- **WHEN** the club's officer page does not open, or holds no club
- **THEN** they are told the page did not open, and nothing is kept

### Requirement: An officer on the list is approved at once
When the person signed in with an email of their school, and their name is on the club's public officer list, the club SHALL be theirs at once, with the role the list gives. Two names SHALL count as the same when their first and last words match, ignoring case, accents, apostrophes, hyphens and anything between. A name of one word SHALL never match.

#### Scenario: Name on the list
- **WHEN** Ana Lopez, signed in with her school email, checks a club whose list has "Ana María López, Treasurer"
- **THEN** she is told the club is hers and that she is on its officer list as Treasurer, and it shows under "Your clubs" as "Yours"

#### Scenario: No school email
- **WHEN** someone whose name is on the list checks it, signed in with an email that is not their school's
- **THEN** they are treated as not on the list

#### Scenario: Checking again
- **WHEN** someone who already has the club checks it again
- **THEN** they are told it is theirs, and the school's site is not read again

### Requirement: Anyone else may ask for review
A person who is not approved by the list SHALL be told so, shown a link to the list, and offered "Send for review" with a note of up to 600 characters. Nothing SHALL be kept until they send it. A sent claim SHALL wait for the admin and show to the person as "Being checked".

#### Scenario: Not on the list
- **WHEN** a person checks a club whose list does not have their name
- **THEN** they see "Not on the list" with the club's name, and no claim is kept

#### Scenario: Sent for review
- **WHEN** they write a note and press "Send for review"
- **THEN** the claim waits for the admin with the note, and they see "Being checked"

#### Scenario: Pasting the link again while waiting
- **WHEN** they check the same club again before the admin has decided
- **THEN** they see "Being checked", and no second claim is made

### Requirement: The admin sees every claim and can override it
The admin page SHALL have a "Clubs" section listing every claim, those waiting first: the club, the person, the email they signed in with, the role, the day, how it was decided, the note, and the officer list as it was read. The section's link SHALL show how many are waiting. The admin SHALL be able to approve a claim that is waiting or turned down, turn down one that is waiting, and take back one that is approved, including one approved from the list. Only the admin SHALL be able to do these.

#### Scenario: An automatic approval is listed
- **WHEN** a club was approved from the officer list
- **THEN** its row reads "Approved by Loopd, from the officer list" and offers "Take back"

#### Scenario: Approving a waiting claim
- **WHEN** the admin presses "Approve" on a waiting claim
- **THEN** the club is that person's, and the row reads "Approved by you"

#### Scenario: Taking back
- **WHEN** the admin presses "Take back" on an approved claim
- **THEN** the club is no longer that person's, and the row reads "Turned down by you"

#### Scenario: Someone else calls the action
- **WHEN** a person who is not the admin sends the approve or turn-down action
- **THEN** nothing changes

### Requirement: The admin's word stands
Once the admin has decided a claim, a later check by that person for that club SHALL answer with the admin's decision, whatever the officer list says.

#### Scenario: Turned down, then checked again
- **WHEN** a person whose claim the admin turned down checks the club again, and their name is on the list
- **THEN** they are told the claim was turned down, and it stays turned down

### Requirement: The organizers page leads to the claim page
After the sign-up form on the organizers page has saved, its answer SHALL offer one pill that opens the claim page. Opened on its own as a mockup, the page SHALL not show it.

#### Scenario: After signing up
- **WHEN** a visitor's sign-up on `/organizers` is saved
- **THEN** the answer shows "Check you run it", which opens `/organizers/claim`

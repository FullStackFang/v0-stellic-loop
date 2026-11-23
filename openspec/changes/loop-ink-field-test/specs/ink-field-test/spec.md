## ADDED Requirements

### Requirement: A signed-out press is kept
When someone who is not signed in presses a sign-up button for Ink or Ink+ and gives no email, the system SHALL keep the plan, the button's place, the time and the browser's visitor number if it has one, and SHALL then answer exactly as before, so the sign-in card opens. The top bar's retry of a held plan SHALL NOT be kept as a press. The press SHALL NOT give anyone a plan. A press that cannot be kept SHALL NOT stop the person being sent to sign in.

#### Scenario: Pressing Ink+ on Conga while signed out
- **WHEN** a signed-out visitor presses the Ink+ button on Conga's locked ground card
- **THEN** one row is kept with plan Ink+, place "conga: Get Ink+", the time, and the visitor number from the `lp_v` cookie
- **AND** the answer is the same 401, so the sign-in card opens over the game

#### Scenario: Opening more pages while the plan is held
- **WHEN** that visitor, still signed out, opens three more pages within the hour
- **THEN** no more rows are kept

#### Scenario: No visitor cookie
- **WHEN** a signed-out press arrives with no `lp_v` cookie
- **THEN** the row is kept with no visitor number

#### Scenario: Before the migration is applied
- **WHEN** a signed-out press arrives and the table does not yet take a row with no email
- **THEN** nothing is kept, no error is shown, and the answer is the same 401 with the sign-in address

#### Scenario: Too many presses from one address
- **WHEN** more than 20 signed-out presses arrive from one address in a minute
- **THEN** the presses over the limit are not kept, and each still gets the 401 with the sign-in address

#### Scenario: A press with no email is never claimed
- **WHEN** someone signs in after pressing a button signed out with no email
- **THEN** they are given no plan for that press, and the row stays as it was

#### Scenario: The Ink page's email sign-up is unchanged
- **WHEN** a signed-out visitor signs up on the Ink page with an email
- **THEN** the email, plan and place are kept as before, and the plan is theirs when they sign in with that email

### Requirement: The admin reads sign-up times in New York time
Every time the admin's Premium tab shows for a sign-up, a signed-out press, a call ask's "sent" and a club claim SHALL be New York time, and the tab SHALL say so once. The days and times a person typed for a call SHALL stay as they typed them.

#### Scenario: An evening sign-up
- **WHEN** someone signs up at 01:30 UTC on November 24
- **THEN** the Premium tab shows 2026-11-23 20:30
- **AND** the tab says times are New York time

### Requirement: The admin's own sign-ups are marked
In the Premium tab's list of sign-ups, a row whose email is one the admin is listed by SHALL show "Yours". The number of sign-ups the tab states SHALL leave those rows out.

#### Scenario: The founder tests a button
- **WHEN** the admin signs up for Ink+ from the account row, and one other person has signed up
- **THEN** the list shows both rows, the admin's marked "Yours"
- **AND** the tab says 1 sign-up

### Requirement: The admin sees signed-out presses with no email
The Premium tab SHALL list presses made signed out with no email apart from the Ink page's email sign-ups: the plan, the place and the time, newest first, with how many there are. It SHALL say these people were sent to sign in and gave no email.

#### Scenario: Two presses on Seats
- **WHEN** two signed-out visitors have pressed "Get Ink" on Seats
- **THEN** the tab lists two rows reading Ink, "seats: Get Ink" and the time, under a line that says 2 presses were made signed out with no email

#### Scenario: None yet
- **WHEN** nobody has pressed a button signed out
- **THEN** that list and its line are not shown

### Requirement: The legal pages say what signing up does
The Terms SHALL have a part about Ink that says signing up for Ink or Ink+ charges nothing, that it is a test of interest, and that the plan may change or end. Privacy SHALL say that a sign-up keeps the email, the plan, the button pressed and when, and that a press made signed out keeps the same without an email. Both pages SHALL carry the date they were changed. The words SHALL be the ones the founder approved.

Proposed words, for his yes:
- Terms, part "Ink", short: "Signing up for Ink charges nothing." Full: "Ink and Ink+ are not for sale yet. When you sign up we charge nothing and take no card: we give you the plan for now and write to you when it is ready. It is a test of interest, so what a plan holds and its price may change, and it may end."
- Privacy, added to what we keep: "When you sign up for Ink or Ink+ we keep your email, the plan, the button you pressed and when. If you press one while signed out, we keep the same without an email."

#### Scenario: Reading the Terms
- **WHEN** anyone opens the Terms
- **THEN** a part named Ink says signing up charges nothing and that the plan may change or end

#### Scenario: Reading Privacy
- **WHEN** anyone opens Privacy
- **THEN** it says what a sign-up keeps, signed in and signed out

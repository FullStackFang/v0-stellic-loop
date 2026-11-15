## ADDED Requirements

### Requirement: A member can ask the group a question
A member with the right to post SHALL be able to create an ask in a group, from the site or through an assistant with a read-and-write grant. An ask SHALL have a question, a kind, a closing time and a reveal setting. The kinds SHALL be: pick one option, pick several options, pick dates, and a short written answer. Option kinds SHALL have between 2 and 10 options. The closing time SHALL be in the future and at most 60 days out. An ask MAY belong to one event.

#### Scenario: Lead asks through their assistant
- **WHEN** a member's assistant calls the ask tool with "Which date works?", three dates and a closing time on Friday
- **THEN** the ask is saved in one call, the reply returns it in full with its share link and a ready-to-paste message, and the change log names the assistant

#### Scenario: Lead asks on the site
- **WHEN** a member fills in the ask form with a question, options and a closing time
- **THEN** the ask is saved and the page shows its share link with "Send to WhatsApp" and copy-link controls

#### Scenario: One option is refused
- **WHEN** a pick-one ask is submitted with a single option
- **THEN** nothing is saved and the reply says at least two options are needed

#### Scenario: Follower cannot ask
- **WHEN** a follower tries to create an ask
- **THEN** nothing is saved and the reply says why

### Requirement: Each member answers once and may change it until the ask closes
A member with the right to post SHALL be able to answer an open ask from the site, the share link, or an assistant with a read-and-write grant. A member SHALL have at most one answer per ask; a later answer SHALL replace the earlier one. An answer SHALL be valid for the ask's kind. A person SHALL NOT be able to answer for anyone else. A member SHALL be able to remove their answer while the ask is open.

#### Scenario: Answering from the link
- **WHEN** a signed-in member opens an ask's share link and picks an option
- **THEN** the answer is saved and the page shows the member what they answered

#### Scenario: Changing an answer
- **WHEN** a member who answered "the 14th" answers again with "the 21st" while the ask is open
- **THEN** only "the 21st" counts

#### Scenario: Answering through an assistant
- **WHEN** a member's assistant calls the answer tool for an open ask with a valid option
- **THEN** the answer is saved in one call and the reply states exactly what was recorded and how to change it

#### Scenario: Option that does not exist
- **WHEN** an answer names an option the ask does not have
- **THEN** nothing is saved and the reply lists the valid options

### Requirement: Asks close
An ask SHALL stop accepting answers at its closing time. The person who asked, and the group's owners and organizers, SHALL be able to close it earlier. Whether an ask is open SHALL be decided against the database clock at the time of each write. A closed ask SHALL NOT be reopened.

#### Scenario: Answer after the closing time
- **WHEN** a member submits an answer one minute after the closing time
- **THEN** nothing is saved and the reply says the ask closed and shows the result the member is allowed to see

#### Scenario: Closing early
- **WHEN** the person who asked closes the ask before its closing time
- **THEN** it accepts no further answers and its result is final

### Requirement: Results follow the reveal setting
The person asking SHALL choose a reveal setting when creating the ask: named or counts. In a named ask, members and followers of the group SHALL see who gave which answer. In a counts ask, every viewer including the asker, owners and organizers SHALL see totals only, and written answers without names. The reveal setting SHALL NOT change after the first answer. Results SHALL be available on the site and through a connector tool, to members and followers of the group only.

#### Scenario: Named result
- **WHEN** a member reads the result of a named ask
- **THEN** each option lists the members who chose it, by handle or as "a teammate" to an assistant

#### Scenario: Counts result hides the asker's view too
- **WHEN** the person who asked reads the result of a counts ask
- **THEN** they see totals per option and no indication of who chose what

#### Scenario: Reveal is fixed after the first answer
- **WHEN** the asker tries to switch a counts ask to named after one member has answered
- **THEN** the change is refused

#### Scenario: Non-member reads nothing
- **WHEN** a person who is not in the group requests an ask's results
- **THEN** no answers and no totals are returned

### Requirement: The asker and organizers can see who has not answered
While an ask is open, and for 7 days after it closes, the person who asked and the group's owners and organizers SHALL be able to see which current members with the right to post have not answered. Every other member SHALL see only how many have answered out of how many. The system SHALL NOT compute or return any view of non-responders across more than one ask.

#### Scenario: Asker sees who is missing
- **WHEN** the person who asked opens their ask and 9 of 14 members have answered
- **THEN** they see "9 of 14 answered" and the five members who have not

#### Scenario: Another member sees only the count
- **WHEN** a member who did not create the ask and is not an organizer opens it
- **THEN** they see "9 of 14 answered" and no list of who has not

#### Scenario: The list expires
- **WHEN** the asker opens the ask 8 days after it closed
- **THEN** the list of who did not answer is no longer shown

#### Scenario: No cross-ask view
- **WHEN** any tool or page is asked which members answer least often across asks
- **THEN** no such result exists to return

### Requirement: A reminder the asker sends, naming nobody
The ask page SHALL offer the asker and organizers a reminder message that states how many have yet to answer, the closing time and the share link, with a "Send to WhatsApp" control and a copy control. The reminder text SHALL NOT name any member. Loop SHALL send nothing itself.

#### Scenario: Reminder text
- **WHEN** the asker taps the reminder control with five members still to answer and the ask closing Friday
- **THEN** WhatsApp opens with a message such as "5 still to answer by Friday" followed by the share link, and no member's name

### Requirement: Asks have a share link that carries no access
Each ask SHALL have a share link with an unguessable token. The link SHALL grant no access and no membership. A signed-in member SHALL be able to answer from the page it opens. A person who is signed out or not in the group SHALL see only the question, the group's name and the closing time, with a way to sign in or join. The link preview SHALL contain only that same view.

#### Scenario: Signed-out visitor
- **WHEN** a signed-out person opens an ask link
- **THEN** the page shows the question, the group's name and the closing time, offers sign-in, and shows no options chosen, no totals and no names

#### Scenario: Preview in a chat
- **WHEN** the link is pasted into a chat and a preview is fetched
- **THEN** the preview contains the question and closing time and nothing about answers

### Requirement: Open asks appear in what is new and in the brief
Creating and closing an ask SHALL enter the group's change sequence. Individual answers SHALL NOT. `whats_new` SHALL list each open ask the caller has not answered and mark those closing within 48 hours. `team_brief` SHALL state how many asks are open and how many of them the caller has not answered.

#### Scenario: Unanswered ask surfaces
- **WHEN** a member with one unanswered open ask calls `whats_new`
- **THEN** the reply includes that ask with its question, closing time and how to answer

#### Scenario: Answers are not a feed
- **WHEN** eight members answer an ask
- **THEN** `whats_new` returns no entry per answer

### Requirement: Answers and interest record how they arrived
Each answer and each interest mark SHALL record the route it arrived by: the site, a share link, or an assistant, and for an assistant the name it connected under. The route SHALL be stored for the operator's pilot numbers and SHALL NOT be shown to other members. The stored values SHALL leave room for further routes added by later changes.

#### Scenario: Same ask, two routes
- **WHEN** one member answers from the share link and another through Claude
- **THEN** the first answer is stored with the share-link route and the second with the assistant route and the assistant's name

#### Scenario: Route is not shown to members
- **WHEN** a member reads the result of a named ask
- **THEN** the result shows who answered what and not how each answer arrived

### Requirement: Caps on asks
The system SHALL allow at most 20 open asks per group and at most 5 open asks per member per group. A question SHALL be at most 200 characters, an option at most 80, and a written answer at most 400. Ask and answer writes SHALL count toward the existing limit of 30 writes per hour per person and assistant per group. A capped call SHALL save nothing and explain itself in plain words.

#### Scenario: Sixth open ask by one member
- **WHEN** a member with 5 open asks in a group creates another
- **THEN** nothing is saved and the reply says to close one first

### Requirement: Asks and answers follow membership
When a member leaves a group, their answers to open asks SHALL be removed, their own open asks SHALL be closed, and their answers to closed asks SHALL remain attributed to "a former member". On account deletion the same SHALL apply in every group and the remaining answers SHALL lose their link to the person. A person's export SHALL list their own asks and answers.

#### Scenario: Leaving mid-ask
- **WHEN** a member who answered an open ask leaves the group
- **THEN** their answer no longer counts and the total of members expected to answer drops by one

## MODIFIED Requirements

### Requirement: A member can ask the group a question
A member with the right to post SHALL be able to create an ask in a group, from the site or through an assistant with a read-and-write grant. An ask SHALL have a question, a kind, a closing time and a reveal setting. The kinds SHALL be: pick one option, pick several options, pick dates, a short written answer, and something to do. Option kinds (pick one, pick several, pick dates) SHALL have between 2 and 10 options. A written answer and something to do SHALL have no options. The closing time SHALL be in the future and at most 60 days out; for something to do it is the due time. An ask MAY belong to one event.

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

#### Scenario: Posting a to-do
- **WHEN** an organizer creates an ask of kind "something to do" with the question "Upload your W8/W9" closing Nov 22
- **THEN** it is saved with no options, and every member who may post is counted as not having done it

#### Scenario: Options on a to-do are refused
- **WHEN** someone creates an ask of kind "something to do" with options
- **THEN** nothing is saved and the reply says this kind takes no options

### Requirement: Results follow the reveal setting
The person asking SHALL choose a reveal setting when creating the ask: named or counts. An ask of kind "something to do" SHALL always be named, whatever setting is sent, and SHALL NOT be switched to counts. In a named ask, members and followers of the group SHALL see who gave which answer. In a counts ask, every viewer including the asker, owners and organizers SHALL see totals only, and written answers without names. The reveal setting SHALL NOT change after the first answer. Results SHALL be available on the site and through a connector tool, to members and followers of the group only.

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

#### Scenario: A to-do sent as totals-only
- **WHEN** someone creates an ask of kind "something to do" with the totals-only setting
- **THEN** it is saved as named

#### Scenario: Switching a to-do to totals-only
- **WHEN** the asker tries to switch a to-do to totals-only before anyone has marked it done
- **THEN** the change is refused

### Requirement: Asks close
An ask SHALL stop accepting answers at its closing time. The person who asked, and the group's owners and organizers, SHALL be able to close it earlier. Whether an ask is open SHALL be decided against the database clock at the time of each write. The person who asked, and the group's owners and organizers, SHALL be able to give an ask of any kind a new closing time, in the future and at most 60 days out, whether it is still open, passed its time, or was closed early. An ask given a new closing time SHALL accept answers again, SHALL keep the answers it has, and the change SHALL be recorded in the group's change log. Nobody else SHALL be able to reopen an ask. An ask that Loop itself opened to settle an idea's day SHALL NOT be reopened once it has closed.

#### Scenario: Answer after the closing time
- **WHEN** a member submits an answer one minute after the closing time
- **THEN** nothing is saved and the reply says the ask closed and shows the result the member is allowed to see

#### Scenario: Closing early
- **WHEN** the person who asked closes the ask before its closing time
- **THEN** it accepts no further answers until someone allowed to reopens it

#### Scenario: Reopening a poll with too few answers
- **WHEN** a poll closed today with 6 of 20 answered and its organizer gives it a new closing time on Friday
- **THEN** it accepts answers again, the 6 answers stay, and the 14 who have not answered can

#### Scenario: Extending a passed to-do
- **WHEN** an organizer gives a to-do that passed yesterday a new due time next Friday
- **THEN** it accepts answers again, the 14 members already done stay done, and the 6 who are not can mark it done

#### Scenario: Extending before it closes
- **WHEN** the asker moves an open ask's closing time from today to Friday
- **THEN** it stays open until Friday

#### Scenario: A member cannot reopen
- **WHEN** a member who did not ask it and is not an owner or organizer tries to give an ask a new closing time
- **THEN** nothing changes and the reply says why

#### Scenario: An idea's day ask
- **WHEN** someone tries to reopen the closed ask that settled an idea's day
- **THEN** nothing changes

## ADDED Requirements

### Requirement: A member marks a to-do done once and may take it back
A member with the right to post SHALL be able to mark an open to-do done from the site, the share link, a message's answer link, or an assistant with a read-and-write grant. The answer SHALL carry no choice and no text; an answer that carries either SHALL be refused. A member SHALL be able to take it back while the to-do is open. Marking it done twice SHALL save nothing new.

#### Scenario: Marking done
- **WHEN** a member marks an open to-do done
- **THEN** they are counted as done and are no longer listed as not having done it

#### Scenario: Taking it back
- **WHEN** a member who marked a to-do done takes it back before it closes
- **THEN** they are listed again as not having done it

#### Scenario: Past its due time
- **WHEN** a member tries to mark a to-do done after its closing time
- **THEN** nothing is saved and the reply says it has closed

#### Scenario: Through an assistant
- **WHEN** an assistant calls the answer tool for a to-do with no choices and no text
- **THEN** the member is marked done

#### Scenario: A choice sent for a to-do
- **WHEN** an answer to a to-do carries a choice or text
- **THEN** nothing is saved and the reply says a to-do is only marked done

### Requirement: A to-do is worded as something done, not something answered
Wherever a to-do is shown or sent (the ask's page, lists of asks, the reminder, outbound messages, assistant replies and the in-chat card), its count SHALL read as how many have done it, its missing list as who has not done it, its action as "Done", and a member's own state as done or not done. No surface SHALL show option controls or an empty answer for a to-do.

#### Scenario: The count
- **WHEN** 14 of 20 members have marked a to-do done
- **THEN** its page reads "14 of 20 done"

#### Scenario: The reminder
- **WHEN** the asker opens the reminder for a to-do with 6 members left
- **THEN** it reads that 6 are still to do it by the due time, with the link, and names nobody

#### Scenario: Your own state in a list
- **WHEN** a member who marked a to-do done sees it in the group's list of asks
- **THEN** it reads that they have done it, not "Your answer:" followed by nothing

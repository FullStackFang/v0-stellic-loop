# going-together Specification

## Purpose
How many times two people have been out together (outings both checked in on), and the rule that the number orders things and is never shown. Created by archiving change campus-going-together.
## Requirements
### Requirement: Times out together
The system SHALL count, for a person and each other person, the number of different outings on which both checked in. An outing where only one of the two checked in SHALL NOT count.

#### Scenario: Two outings together
- **WHEN** Ana and Dev have both checked in on two different outings
- **THEN** Ana's count with Dev is 2, and Dev's count with Ana is 2

#### Scenario: One of them did not check in
- **WHEN** Ana and Bea were in the same outing and only Ana checked in
- **THEN** Ana's count with Bea is 0

#### Scenario: Same outing, counted once
- **WHEN** Ana and Dev checked in on one outing
- **THEN** the count is 1, however many other people were in it

### Requirement: The count is never shown
The system SHALL NOT show the count, or any label, word or mark that stands for it, to any person. The line saying how a person is known SHALL stay as it is today.

#### Scenario: Invite panel
- **WHEN** a person opens "Invite people" and someone they have been out with six times is listed
- **THEN** the line under that name reads as it does today, and no number appears

#### Scenario: Ticket
- **WHEN** an event is among a person's best because people they go out with often are in
- **THEN** the ticket shows their faces as it would anywhere, and no text saying why

### Requirement: Faces in order of times out
Where a ticket shows the faces of people a person knows who are going, the system SHALL list those the person has been out with most first.

#### Scenario: A regular and a group mate
- **WHEN** Dev (six times out with the viewer) and Bea (none, same group) are both in an event
- **THEN** Dev's face comes before Bea's

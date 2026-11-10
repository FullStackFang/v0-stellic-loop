## ADDED Requirements

### Requirement: Member-stated records only
The system SHALL store only the bounded fields submitted for a record and SHALL NOT accept or store conversation transcripts.

#### Scenario: Out-of-schema or oversize input
- **WHEN** a write includes fields outside the record's schema or a field over its stated limit
- **THEN** the write is rejected and the rejected content appears in no table, log or audit row.

#### Scenario: Single-line text
- **WHEN** a title, statement, claim text, summary or topic key is saved
- **THEN** line breaks, control characters, bidirectional controls and zero-width characters have been removed from the stored value.

#### Scenario: Return of what was stored
- **WHEN** a record is saved
- **THEN** the result contains the stored fields, the record's number, the team and event it was saved to, and how to withdraw it.

### Requirement: Isolation from shared notes
The system SHALL keep team records invisible and unchangeable through the existing shared-note tools and services.

#### Scenario: Note tools
- **WHEN** an existing note search, read, context or write tool is called for a team that has decisions, outputs, claims or announcements
- **THEN** none of those records is returned or modified.

### Requirement: Filed outputs are pointers
The system SHALL store a filed output as a constrained https URL, a title and a summary, and SHALL NOT fetch, copy or verify the linked file.

#### Scenario: Filing a link
- **WHEN** a member with write access files an output whose URL passes the URL rules
- **THEN** the pointer is stored under the member's name and is readable by the team, whatever its host.

#### Scenario: Unrecognised host
- **WHEN** a stored output's host is not on Loop's built-in list of well-known document hosts
- **THEN** every text result and the team page show it as an unrecognised host beside its title.

#### Scenario: Rejected link
- **WHEN** the URL is not https, exceeds 500 characters, contains userinfo or a non-default port, or its host is an IP address, a name without a dot, or a non-ASCII or punycode name
- **THEN** nothing is saved and the result names the reason.

#### Scenario: Replacing an output
- **WHEN** a member files an output that names an existing current output of the same team as replaced
- **THEN** the named output leaves the current list, remains in history marked as replaced, and the new one is current.

#### Scenario: Closing a claim
- **WHEN** a filed output names an open claim owned by the caller
- **THEN** the claim is marked done in the same transaction.

### Requirement: Decisions supersede by topic
The system SHALL keep at most one current decision per topic key across a team and its events, and SHALL change a decision only by superseding or withdrawing it.

#### Scenario: New topic
- **WHEN** a member logs a decision with a topic key that does not exist and confirms the topic is new
- **THEN** it becomes the current decision for that topic.

#### Scenario: Unconfirmed new topic
- **WHEN** the topic key does not exist and the new-topic confirmation is absent
- **THEN** nothing is saved and the team's existing topics with their current statements are returned.

#### Scenario: New-topic confirmation on an existing topic
- **WHEN** the new-topic confirmation is sent for a key that already has a decision
- **THEN** nothing is saved and the current decision is returned.

#### Scenario: Superseding
- **WHEN** a member logs a decision that names the current decision for that topic as superseded
- **THEN** the new decision becomes current, the prior one is marked superseded, and the result includes the prior statement and author.

#### Scenario: Superseding something no longer current
- **WHEN** the named decision is not the current one for that topic, including when another member superseded it first
- **THEN** nothing is saved and the current decision is returned.

#### Scenario: Topic left without a current decision
- **WHEN** the current decision for a topic is withdrawn and nothing superseded it
- **THEN** the topic key is free and the next decision on it is treated as a new topic.

#### Scenario: Correction attempt
- **WHEN** anyone tries to edit a decision's statement or topic
- **THEN** it is rejected.

### Requirement: Claims name their owner and who recorded them
The system SHALL let any member with write access record a claim naming any current member as owner, SHALL store who recorded it and through which assistant, and SHALL treat a claim recorded for another person as proposed until that person confirms it.

#### Scenario: Self-claim
- **WHEN** a member with write access claims an item for themselves, with or without a due date
- **THEN** an open claim owned by that member is stored.

#### Scenario: Recorded for someone else
- **WHEN** a member records a claim naming another current member as owner
- **THEN** a proposed claim is stored, it appears in the named member's mentions, and every view shows it as proposed by its recorder and not confirmed.

#### Scenario: Confirming or declining
- **WHEN** the named owner confirms or declines a proposed claim
- **THEN** it becomes open or declined, and the change appears in `whats_new`.

#### Scenario: Confirming something no longer proposed
- **WHEN** a confirmation arrives for a claim that was already declined, released or withdrawn
- **THEN** nothing changes and the current status is returned.

#### Scenario: Overlap reported
- **WHEN** a claim is saved with a list of existing open or proposed claims it overlaps
- **THEN** it is saved, and it and each named claim are marked as overlapping until one of them is done, released or declined.

#### Scenario: Finishing or releasing
- **WHEN** the claim's owner, its recorder, or an owner or organizer marks it done or released
- **THEN** its status changes and the change appears in `whats_new`.

#### Scenario: Non-member as owner
- **WHEN** a claim names someone who is not a current member of the team
- **THEN** nothing is saved.

### Requirement: Conflicts are checked before every output save
The system SHALL NOT save or correct a filed output unless the call carries the team's current decisions version and a list of the decisions the output contradicts.

#### Scenario: No current version
- **WHEN** an output is filed or corrected without the current decisions version
- **THEN** nothing is saved, the result is not an error, and it contains the current decisions and the version.

#### Scenario: Decision lands during a save
- **WHEN** a decision is written concurrently with an output save that carries the previous version
- **THEN** either the output save sees the new version and saves nothing, or it completes before the decision commits; it never saves against decisions it was not given.

#### Scenario: No conflict reported
- **WHEN** an output is filed with the current version and an empty list
- **THEN** it is saved without a flag.

#### Scenario: Conflict reported
- **WHEN** an output is filed with the current version and a non-empty list, without the file-anyway confirmation
- **THEN** nothing is saved, the result names the contradicted decisions, and a reported-conflict event containing no record content is stored.

#### Scenario: Filed despite a conflict
- **WHEN** the call includes the file-anyway confirmation
- **THEN** the output is saved with a conflict flag naming those decisions.

#### Scenario: Flag survives edits
- **WHEN** a flagged output is corrected
- **THEN** the correction is subject to the same check, and a flag is removed only if the new list is empty or the decision it names is no longer current.

#### Scenario: Flagged decision superseded
- **WHEN** a decision named in a flag is superseded
- **THEN** the flag changes to needs-re-check and remains visible until the output is corrected or re-filed.

#### Scenario: A new decision contradicts filed outputs
- **WHEN** a decision is logged with a list of current outputs it contradicts
- **THEN** each named output is flagged with that decision.

### Requirement: Authors can correct and withdraw
The system SHALL let the author correct their outputs and withdraw their outputs, claims and decisions, and SHALL let an owner or organizer withdraw any record in their team on the site.

#### Scenario: Withdrawal removes content
- **WHEN** an authorized person withdraws a record
- **THEN** its URL and text are removed from every stored version, no tool or page returns them, and `whats_new` reports only that record number was withdrawn.

#### Scenario: Stale correction
- **WHEN** a correction names a version that is no longer current
- **THEN** it is rejected and the current version is returned.

#### Scenario: Retry
- **WHEN** the same person and assistant repeat an identical write to the same team within 10 minutes, or reuse an operation ID with identical content
- **THEN** the original result is returned and no second record is created.

### Requirement: Access follows current membership and consent
The system SHALL allow team records to be read only by current members and followers of the team and written only by members, organizers and owners, and through an assistant only while that person's consent for that assistant and team is active.

#### Scenario: Read-only assistant
- **WHEN** an assistant with read consent but not write consent calls a write tool
- **THEN** the write is denied and nothing is stored.

#### Scenario: Member removed or account deleted
- **WHEN** a person's membership is revoked or their account is deleted
- **THEN** their assistants can no longer read or write the team's records, their open claims are released, claims proposed for them are declined, tags on them are removed, and their handle is deleted.

#### Scenario: Other team
- **WHEN** a caller names a record, decision, event or tag belonging to a team they are not in
- **THEN** the result is the same as if it did not exist.

### Requirement: Write caps
The system SHALL limit writes to 30 per hour per person, assistant and team, and SHALL limit a team to 100 open claims, 300 current outputs and 200 current decisions.

#### Scenario: Cap reached
- **WHEN** a write would exceed a cap
- **THEN** nothing is saved and the result says which cap was reached.

### Requirement: Records carry person tags
The system SHALL let a record carry up to 5 tags of people in the same team, and SHALL let a tagged person remove the tag.

#### Scenario: Tagging a teammate
- **WHEN** a record is saved with a tag that resolves to exactly one current teammate
- **THEN** the record appears in that person's mentions and no message is sent.

#### Scenario: Unresolvable or ambiguous tag
- **WHEN** a tag does not resolve to exactly one person in the team
- **THEN** nothing is saved and the result says that no current teammate has that handle.

#### Scenario: Removing a tag on yourself
- **WHEN** a tagged person removes the tag on the site
- **THEN** the record no longer appears in their mentions.

### Requirement: Concurrent writes are serialised per team
The system SHALL apply writes to one team one at a time, SHALL assign record numbers and change numbers in commit order, and SHALL NOT let one write silently overwrite another.

#### Scenario: Simultaneous writers
- **WHEN** five assistants write to the same team at the same moment
- **THEN** every accepted write is stored exactly once, record numbers are unique and follow commit order, and no accepted write is lost.

#### Scenario: Stale expectation
- **WHEN** a write names a decision, version or status that another write has since changed
- **THEN** nothing is saved and the current state is returned.

#### Scenario: Simultaneous retries
- **WHEN** two copies of the same call with the same operation ID arrive together
- **THEN** one record is created and both callers receive it.

#### Scenario: Caps under contention
- **WHEN** simultaneous writes would together exceed a cap
- **THEN** only the writes within the cap are saved.

#### Scenario: Consent revoked before a write
- **WHEN** a member's consent or membership is revoked before a write's transaction checks it
- **THEN** the write is denied.

#### Scenario: Lock wait exceeded
- **WHEN** a write cannot obtain the team's write lock within 2 seconds
- **THEN** nothing is saved and the result says to try again.

#### Scenario: Consistent reads
- **WHEN** a read tool runs while a write is in progress
- **THEN** its result reflects the team entirely before or entirely after that write.

## MODIFIED Requirements

### Requirement: One answer per person per proposal
A person SHALL hold at most one answer (`in` or `out`) per proposal and SHALL be able to change it at any time, including after formation. Every change SHALL write a `response` event carrying the new and previous answer and the source. The actions SHALL reject `maybe`; existing `maybe` rows SHALL be ignored everywhere and SHALL not be shown.

#### Scenario: Change of mind
- **WHEN** Priya changes from `out` to `in`
- **THEN** one response row shows `in` and a `response` event records `out` → `in`

#### Scenario: Legacy maybe
- **WHEN** a proposal has 3 in and 2 legacy maybe
- **THEN** the page reads "3 of 4" and names only the three

### Requirement: Names are visible to anyone with the link
The plan page SHALL show the first names and faces of people who are in to anyone who opens it, honouring each person's name switch (a switched-off person shows as an unnamed ring). A person who dropped after formation SHALL show as a small grey row "<name> can't make it". No day heat SHALL be shown.

#### Scenario: Who's in
- **WHEN** a person opens a plan with Priya Sharma and Marcus Lee in
- **THEN** the faces read "Priya" and "Marcus" and no surname appears

## REMOVED Requirements

### Requirement: Maybe never counts
**Reason**: The spec has one primary button; a maybe is a yes you did not mean, and it never counted.
**Migration**: The In / Maybe / Out control is replaced by I'm in with Can't make it. The `answer` enum keeps `maybe` in the database; no rows are deleted.

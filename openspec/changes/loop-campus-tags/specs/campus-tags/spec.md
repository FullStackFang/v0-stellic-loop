## ADDED Requirements

### Requirement: An @ is a tag, and a plan may carry several
An @ followed by 2 to 30 lower-case letters, digits and dashes SHALL be a tag that belongs to one campus. Nobody approves one: it SHALL exist from the first plan posted with it. A plan SHALL carry up to four tags, in the order typed; a fifth SHALL be left in the title as written. A time said after an @ SHALL still be read as a time, not as a tag.

#### Scenario: Two tags in one line
- **WHEN** a Cornell student posts "morning loop @jogging @collegetown tomorrow 7am"
- **THEN** the plan is "Morning loop" tomorrow at 7am with the tags @jogging and @collegetown

#### Scenario: A time is not a tag
- **WHEN** the line is "@jogging @tonight"
- **THEN** the plan has one tag, @jogging, and its time is today at 7pm

### Requirement: Every tag has a kind that nobody is asked for
A tag SHALL have a kind: place, activity, event or other. The person posting SHALL NOT be asked for it. Until a tag has been sorted it SHALL behave as other. Only a tag of kind place SHALL be used for the map and for a plan's exact spot, and a plan's place SHALL be its first tag of kind place.

#### Scenario: An activity stays off the map
- **WHEN** a plan is tagged @jogging and @collegetown, and @collegetown is a place
- **THEN** the plan is shown on the map at @collegetown, and @jogging is shown on the plan only

#### Scenario: A plan with no place tag
- **WHEN** a plan's only tag is @jogging
- **THEN** it is on the list with its tag and is not placed on the map by that tag

### Requirement: Tags that mean the same thing are grouped automatically
Tags of the same kind that mean the same thing SHALL be grouped without anyone asking, with one of them as the group's lead. What a person typed SHALL NOT be rewritten: their plan keeps their own tag. People counts and suggestions SHALL treat a group as one. Tags of different kinds SHALL NOT be grouped. Posting SHALL NOT wait for grouping, and when grouping cannot run, tags SHALL stay as they are and everything else SHALL work.

#### Scenario: Words the table knows
- **WHEN** @running is in use and a student posts with @jogging
- **THEN** @jogging joins the group led by @running, the student's plan still reads @jogging, and the count for @running includes them

#### Scenario: A spelling with a dash
- **WHEN** @collegetown is in use and a student posts with @college-town
- **THEN** the two are one group

#### Scenario: Different kinds are kept apart
- **WHEN** @track is a place and a student's tag would be an activity that means track running
- **THEN** it is not joined to the place @track

#### Scenario: The outside helper is off
- **WHEN** automatic sorting by model is switched off or fails
- **THEN** the plan is posted as usual and the new tag stays on its own until it is sorted by the word table or by hand

### Requirement: Suggestions come from the whole group
While a person types an @, the tags offered SHALL be the campus's groups in use, busiest first, matched against every tag in each group, and shown as the group's lead with the group's people count. Picking one SHALL write the lead. A person SHALL still be free to keep their own word.

#### Scenario: Steered to the common word
- **WHEN** 12 people are in plans tagged @running or @jogging, and a student types "@jog"
- **THEN** they are offered "@running · 12 people this week", and picking it puts @running in the line

### Requirement: The admin can correct kinds and groups, and corrections stick
The admin page SHALL list a campus's tags by group with kind and people count, and SHALL let the admin change a tag's kind, join a tag to a group, or split it out. A tag the admin has changed SHALL NOT be changed again by the automatic pass.

#### Scenario: A wrong merge is undone
- **WHEN** the admin splits @track out of the group led by @running
- **THEN** @track is on its own, and later automatic passes leave it there

### Requirement: Only tag names and plan titles leave Loop for sorting
When a model is asked about a tag, the request SHALL contain only that tag, titles of plans posted with it, and the names and kinds of the campus's other tags. It SHALL NOT contain any person's name, email, picture or id. Each tag SHALL be sent at most once.

#### Scenario: What is sent
- **WHEN** the sweep sorts the new tag @slope-day, posted once by one student on the plan "Slope Day pregame"
- **THEN** the request holds "slope-day", "Slope Day pregame" and the campus's lead tags, and nothing about the student

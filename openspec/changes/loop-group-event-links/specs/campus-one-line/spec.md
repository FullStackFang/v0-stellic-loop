## ADDED Requirements

### Requirement: A person posts a campus plan in one line
Posting a campus plan SHALL be one text box, not a form, and it SHALL live on "This week", not on a page of its own. "This week" SHALL always show a small "+" button beside the count, in the line above the row of tickets, so it stays put wherever the row is scrolled to, and the top bar SHALL NOT carry a "Post a plan" button. Pressing the "+" SHALL open a wide panel at the start of the row, with the line on one side and, on the other, the @places people use and the plans already on at the place the line names; the tickets SHALL move over and nothing SHALL be covered. On a week with nothing on, the panel SHALL open beside the "Nothing here yet" card. Pressing the "+" again, or "Close", SHALL close the panel, and posting SHALL close it and show the plan in the row. For a signed-out visitor the "+" SHALL lead to sign-in. The address of the old post page without a plan SHALL lead to "This week". A signed-in person on their own campus types a line the way they would text it, and Loop SHALL read from it what the plan is, when it starts on the campus's clock, and an @place. As the person types, the page SHALL show what was understood: the title, the day and time, and the @place. The server SHALL read the line again when it is posted and SHALL NOT trust what the page showed. A number SHALL count as a time only when it is said as one: with am or pm, with a colon, after "at", or beside a day word. A line with no title or no time SHALL NOT be posted, and the page SHALL ask for what is missing as a question, not as an error. The rules for a posted plan (three coming up, 14 days ahead) apply unchanged. Changing or cancelling a plan keeps its existing form.

#### Scenario: A line with everything
- **WHEN** a Cornell student types "dumplings tonight 7 @collegetown" at 3pm and posts it
- **THEN** the list gains "Dumplings" today at 7pm at @collegetown with them counted in

#### Scenario: The "+" on an empty week
- **WHEN** a signed-in student opens "This week" with nothing on and presses the "+"
- **THEN** the panel opens beside "Nothing here yet", and after they post, the panel is closed and their plan is the first ticket

#### Scenario: Numbers that are not times
- **WHEN** the line is "CS 2110 problem set" or "Running, easy 5K"
- **THEN** no time is read from it and the page asks when

#### Scenario: No day given
- **WHEN** the line says "gym 6pm" at 3pm, or "gym 2pm" at 3pm
- **THEN** the first is today at 6pm and the second is tomorrow at 2pm

### Requirement: A line with no time is helped, not refused
A part of the day SHALL be read as a time when no hour is said: morning as 9am, afternoon as 3pm, evening as 7pm, on the day the line names, or else today while that hour is ahead and tomorrow after. A time said after an @ ("@evening", "@tonight", "@7pm", "@sat") SHALL be read as a time and SHALL NOT become an @place. While the line has a title and no time, the page SHALL show "When?" with up to four times to tap, each shown as the day and hour it would give; every offered time SHALL be ahead, none SHALL be offered twice, and when the line names a day the offered times SHALL be on that day. Tapping one SHALL add it to the line. Pressing "Post it" with a title and no time SHALL ask "When is it?" and SHALL NOT show an error. When a person types an @ followed by the start of a time word, the page SHALL offer that word as "A time, not a place", and SHALL NOT offer to make a place of a time word.

#### Scenario: A time said like a place
- **WHEN** a person types "@central-park go for a run @evening" at 3pm
- **THEN** it is understood as "Go for a run", today at 7pm, at @central-park

#### Scenario: No time yet
- **WHEN** a person types "go for a run" at 3pm on a Wednesday
- **THEN** they are offered Today 7pm, Tomorrow 9am, Tomorrow 12pm and Tomorrow 7pm, and tapping one fills the time in

#### Scenario: A day and no hour
- **WHEN** the line is "movie sat"
- **THEN** only Saturday's hours are offered

### Requirement: People define @places, and the places others use guide the post
An @place SHALL be a name of 2 to 30 lower-case letters, digits and dashes that belongs to one campus. Nobody approves one: it SHALL exist from the first plan posted with it. When a person types @, the page SHALL list the campus's @places whose plans (not cancelled, not hidden, starting from seven days ago onward) have people in them, the one with the most people first, each with that count and the first names of up to two of those people the viewer knows; nobody else SHALL be named. A name that matches no place SHALL be offered as a new one. When the line names an @place that has plans coming up, the page SHALL list them so the person can join one instead of posting another. The list SHALL show a plan's @place, and searching the list for the place's name SHALL find the plan.

#### Scenario: Suggestions while typing
- **WHEN** two people are in plans at @collegetown and one at @college-ave-courts, and a third person types "@coll"
- **THEN** they are offered @collegetown with "2 people this week", then @college-ave-courts, then "Make @coll"

#### Scenario: A place nobody uses any more
- **WHEN** the only plan at an @place was cancelled, was hidden by the admin, or started more than a week ago
- **THEN** that @place is not suggested

#### Scenario: Join instead
- **WHEN** a person's line names @collegetown and a plan there is coming up
- **THEN** that plan is listed under the line with a "Join" button

### Requirement: An event link pasted into the line is read into it
A link in the line SHALL be read once, as the campus-event-links capability describes, and what its page says SHALL stand in for what the line does not say: the title, the start and end, the place, and "Hosted by" the organizer. Words and a time the person types SHALL win over the page's. The plan SHALL keep the link.

#### Scenario: Luma link, then a place
- **WHEN** a person pastes a Luma link, then types "@east-village" and posts
- **THEN** the plan has the page's title, times and place, the link, and the @place east-village

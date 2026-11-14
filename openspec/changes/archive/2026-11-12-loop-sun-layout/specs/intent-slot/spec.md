## ADDED Requirements

### Requirement: An intent carries a day, a time and a place
A proposal SHALL have optional `day` (a date in the board's window), `time_text` and `place`. New posts SHALL set `needs_day = false` and store these three. The when line SHALL read "<Weekday> <d> <Mon>, <time>" using the day and time text, then the place on the next line. A legacy needs-a-day proposal SHALL use its best day as the day and its locked day once formed.

#### Scenario: Full slot
- **WHEN** a person posts "Overnight boat" for Fri 20 Feb at "6:00pm" at "Cat Ba pier"
- **THEN** the plan page reads "Fri 20 Feb, 6:00pm" and "Cat Ba pier" and the row reads "Fri 20 Feb, 6:00pm · Cat Ba pier"

#### Scenario: No day yet
- **WHEN** a person posts "Cohort shirts" with no day, time or place
- **THEN** the when line reads "Any day" and the row shows the title and count only

### Requirement: The hour drives the light
The lighting hour SHALL be parsed from `time_text` by `lib/hour.ts`, accepting forms such as "6pm", "6:30 pm", "18:00", "6.30pm", "noon" and "midnight", case-insensitive. Unparseable or empty time text SHALL light the page at 12:00. The parser SHALL be pure and unit-tested.

#### Scenario: Parse
- **WHEN** the time text is "7:30pm"
- **THEN** the hour is 19.5

#### Scenario: Unreadable
- **WHEN** the time text is "after class"
- **THEN** the hour is 12 and the chip still shows "after class"

### Requirement: The sky comes from the forecast when the space has a location
When the board has `lat` and `lon` and the plan's day is within the next sixteen days, the sky SHALL be looked up once per board and day from Open-Meteo's daily forecast, cached for six hours, and mapped: weather codes 0 to 2 clear, 3 and 45 to 48 cloudy, 51 and above rain. The chip SHALL then read "<temp>°, <clear | overcast | rain, bring a shell> at <time>". Without a location, beyond the horizon, or on any error or a response slower than two seconds, the sky SHALL be clear and the chip SHALL read "at <time>" with the sun glyph.

#### Scenario: Forecast known
- **WHEN** the cohort board has a location and the plan is in four days with code 61 and 24°
- **THEN** the page is lit as rain and the chip reads "24°, rain, bring a shell at 11am"

#### Scenario: No location
- **WHEN** a board has no `lat`
- **THEN** every plan in it is lit clear and no forecast request is made

### Requirement: Slot edits are the poster's, with notice
The poster SHALL be able to change the day, time and place of an open plan; the title SHALL stay fixed. A change SHALL write a `detail_added` event with the new slot and SHALL be visible to everyone on reload. Formed plans SHALL NOT be editable.

#### Scenario: Move the time
- **WHEN** the poster changes "6:00pm" to "7:00pm" on an open plan
- **THEN** the when line updates and the page lights at 19:00

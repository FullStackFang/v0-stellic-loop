## Context

Posting today (`postLineAction` in `app/c/actions.ts` → `postPlan` in `lib/campus/plans.ts`): `readLine` reads the title, the start and up to four @tags. A start is required ("When is it? Say tonight, tomorrow 7pm, sat 10am."). The tags become `campus_tag` rows; `campus_listing.tag_id` is the first tag of kind `place` (openspec loop-campus-tags). A plan's map spot is `campus_listing.place_id → campus_place`, and for a person's plan that is set only from `place` text, which the line never fills. So people's plans almost never have a spot.

`campus_listing.starts_at` is `not null`, and the week list, the "Near you" map, the poster's three-plan limit and "change until it starts" all read it.

`campus_place` has `name`, `other_names`, `lat`, `lon`; `matchPlace` matches a place's names inside a text. The admin's Places tab adds places by hand. Cornell Tech's island has 8 seeded venues plus the Midtown pair from `20261119100000`.

The approved mockups are `public/demo/mockups-map-intent.html` (place) and `public/demo/mockups-map-time.html` (time). Founder rules that apply: the organizer picks and sends (Loopd When); one meaning per surface; clickable controls are pills; nothing pushes the page open; no inner scroll bars; mockup before look changes.

## Goals / Non-Goals

**Goals**
- On Cornell Tech, every plan a person posts stands on a known public place and shows on the map.
- A plan can be posted with a day and no time; the people who say I'm in say which times work; the poster sets it.
- People's plans read as people's plans on the map (their animal) and can be listed alone.

**Non-Goals**
- Addresses, geocoding, or free pins.
- Places for Ithaca or the other New York stops. The script and switch are ready for them; loading them is a later step the founder decides on.
- Emailing or pushing the set time to people. They see it on the plan. (Calendar sending is Loopd When's step 2.)
- More than one day, or a time range, in "When works?". A full poll stays at `/when`.

## Decisions

### D1. "Time not set" is a flag; the plan keeps its day in `starts_at` and `ends_at`
New column `campus_listing.time_open boolean not null default false`. A plan posted with a day and no hour is stored with `starts_at` = that day 00:00 and `ends_at` = 23:59 on the campus's clock, and `time_open = true`.
Why: every reader of `starts_at` keeps working. The week list keeps it until its day ends (`coalesce(ends_at, …) > now`), sorting puts it first in its day, and the one-day map puts it on its day.
*Instead of* making `starts_at` nullable: every query, sort and the limit would need a second path.
Readers that must know: the ticket shows "?" for the time; "has it started" rules use the end of the day while `time_open`; the three-plan limit counts plans whose `ends_at` (or `starts_at`) is ahead.

### D2. The line gives a day when it names one without an hour; no day means today
`readLine` gains `day: 'YYYY-MM-DD' | null`: the day or date the line names, or today when it names none. `starts` stays as it is (null without an hour). Posting uses `starts` when there is one, else `day` with `time_open`.
"Run @southpoint" with no day is today. A day more than 14 days ahead is refused as today.
*Instead of* requiring a day word: "run @southpoint" means now-ish, and refusing it would be the formal posting the founder rejected.

### D3. Places get a short @name and a kind; a tag that names a place is that place
`campus_place` gains `kind text check(kind in ('food','park','sport','building'))` (null for older rows, listed under Buildings). The short @name is not a new column: it is `tagSlug` of the place's first other name, else of its name ("Southpoint Park" with other name "southpoint" → `@southpoint`). `placeTag(place)` and `placeFor(places, slug)` live in `lib/campus/places.ts` and are used by the browser and the server alike.
On posting, the first @tag that `placeFor` resolves sets `place_id` and `place_text` (the place's name), and that tag's kind is set to `place` so `tag_id` and loop-campus-tags grouping keep working.
*Instead of* a `slug` column: other_names already exist and the admin edits them; one more column the admin must fill is worse.

### D4. Places are required per campus, in code
`PLACES_REQUIRED = new Set(['cornell-tech'])` in `lib/campus/places.ts`, beside how `sections.ts` names map campuses. On those campuses `postPlan` refuses a member plan without a resolved place ("Where do you meet? Pick a place."). Elsewhere posting is unchanged. A plan changed later through "Change this plan" follows the same rule.
*Instead of* a database flag: switching a campus on goes with loading its places, a code-reviewed step anyway.

### D5. Picking a place in the panel writes the @ into the line
The posting panel (composer) gets the picker from the mockup: kind tabs over one fixed-height box of place pills, with "Near you" being the eight nearest (browser location if given, otherwise the places most used in plans). Pressing a pill or a map dot puts `@<placeTag>` in the line, replacing a place @ already there. So the line is still the one thing the server reads (design D12 of loop-group-event-links): no hidden field, and what the person sees is what is posted.
While the panel is open on a wide screen, the map shows every place as a small dot (the open tab's ringed; the name on hover). On a phone the panel carries a map strip; pressing it opens the "Near you" map in picking mode with a Done pill.
Typing `@` + letters narrows the box to matching places across all kinds.

### D6. "When works?" is a table of picks, five fixed times
New table `campus_time_pick(listing_id, person_id, at time, primary key(listing_id, person_id, at))`, rows only while the plan is `time_open`. The times are 7:00, 9:00, 12:00, 17:00, 19:00 on the plan's day; for today only those at least 30 minutes ahead. A plan for today posted when none are ahead is refused with "Say a time, like 8pm."
`pickTime(listingId, personId, at, on)` toggles one row and needs the person to be in the plan. `setTime(listingId, posterId, at)` (poster or admin, plan still `time_open`, time still ahead) sets `starts_at` to that time, `ends_at` to null, `time_open` to false, and deletes the plan's picks, in one transaction.
The poster's view shows, per time, the people in the plan who picked it (their animals, through the existing "who sees whom" rules of outings), the time most picked lit (earliest on a tie), and "Send <time>". The poster counts as able to make whatever they send.
*Instead of* reusing `/when` polls: a When poll is a grid of hours over days, owned by a group; a plan needs five buttons for one day.

### D7. People's stamps carry the poster's animal; a "People" part in the source bar
A ticket from a person's plan (`origin = 'member'`) gets `byFace` (the poster's animal, as the face stacks already draw it). `near.tsx` draws it on the stamp in place of the guessed icon; listings keep `pictureOf`. A `time_open` ticket's stamp is white with a red "?" and the day.
The source bar becomes "Best for you · People · <listSource>" plus the greyed "soon" names; "People" lists `origin = 'member'` plans only, in the list and on the map. Phone tabs get the same part before "Near you".

## Risks / Trade-offs

- [OpenStreetMap names drift or are odd ("Riverwalk Commons East")] → the SQL is generated once and read by a person before it is run; the admin renames in Places.
- [35 places are not enough and someone cannot post] → the refusal says to pick the nearest place; the admin adds places in minutes. Watch the Activity tab for refused posts.
- [A plan's time never gets set] → it stays "?" all day and leaves the list at midnight; the poster can still set any time with "Change this plan".
- [Five fixed times do not fit every plan] → a time typed in the line skips "When works?" entirely; the fixed five can later come from the times nearby plans use.
- [The browser's location is off] → "Near you" uses the most-used places; nothing else depends on location.

## Migration Plan

One SQL file for the founder, additive: `campus_listing.time_open`, `campus_place.kind`, `campus_time_pick`, and the Cornell Tech island places (insert … on conflict on the name index do nothing, so the eight seeded venues are kept and get a kind). The SQL is run before the code reaches production, as with every campus migration; the code reads the new columns and would fail without them. Rollback: drop the table and the two columns; the places stay.

## Open Questions

- Should Ithaca get its places and the switch in the same round? (Founder's call; not in this change.)
- Should the set time also reach people outside the app (email "Alex set it for 7am")? Left out per the organizer-sends rule until asked.

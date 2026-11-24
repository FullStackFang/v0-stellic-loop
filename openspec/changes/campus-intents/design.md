## Context

The campus front (`/c/[campus]`) holds listings (`campus_listing`: feed events, hand events, member plans). Each listing can carry outings (`campus_outing`, `campus_outing_member`), which give "I'm in", invite, check-in and rewards. Member plans (`lib/campus/plans.ts`) now need a known place on Cornell Tech and may be posted with a day and no time; "When works?" (`campus_time_pick`) lets people mark times and the poster sends one (change `campus-plan-place-and-time`, built in 2424f79). Tags (`campus_tag`, `lib/campus/tags.ts`) group same-meaning words through the fixed `SAME` table in `lib/campus/words.ts`; events get "good for" words through `TABLE`. Feeds are read hourly (`readFeeds`, `/api/cron/campus-feeds`); reviewed feeds hold new events hidden (`waiting`) until the admin shows them. Pasted links and the browser extension read Luma/Posh pages into member plans with `link`. Loopd When already has a working email outbox (`lib/when/outbox.ts`, `when_message`, Resend sender, `WHEN_SENDING` switch, 15-minute cron).

The founder approved `public/demo/mockups-intent-propose.html` on 2026-11-24 with one change: a proposal never says who made it.

## Goals / Non-Goals

**Goals:**
- An ownerless intent that anyone can find and join, with no time or place.
- Proposals (day + time + place, all required) by anyone in, asked of everyone in, on at 2 going.
- Matching events become proposals by themselves, without an AI model.
- Reuse listings and outings for proposals, so map, list, invite, check-in and rewards work unchanged.

**Non-Goals:**
- Push notifications or SMS; a daily digest; per-person email settings beyond leaving the intent.
- Recurring proposals ("every Tuesday"); voting among proposals; editing a proposal after it is sent.
- Merging intents automatically, or by the admin (can come later through tag groups).
- Changing Conga, deals, groups site, or the Ithaca map.

## Decisions

### D1. An intent is its own table; a proposal is a listing
`campus_intent(id, campus_id, title, words text[], created_by, created_at, closed_at)` with tags through a `campus_intent_tag` join like listings. `campus_intent_member(intent_id, person_id, joined_at)`. A proposal is an ordinary `campus_listing` (origin `member` for a person's, the event's own row for a matched event) linked by `campus_intent_proposal(intent_id, listing_id, outing_id, matched bool, created_at)`, unique on (intent_id, listing_id).
*Why:* the map, list, stamps, outings, check-in and rewards all key on listings; making a proposal a listing gets them free. *Alternative:* a proposals table with its own time/place, rejected because every surface would need a second code path.
`created_by` is kept for limits and abuse only and is never sent to the page.

### D2. One outing per proposal, for the whole intent
Each proposal row owns one outing. "Going" (from the card, the email or the intent) joins that outing; it does not use the "people you know" outing pick in `imInWith`. For a member's proposal the proposer's plan outing is that outing. For a matched event a new outing is made on the event's listing for this intent; people who press I'm in on the event outside the intent keep today's pick.
*Why:* everyone in the intent must land together; otherwise two friends going via the intent can end up in two outings.

### D3. Silence about who proposed
The page model for a proposal has no poster field: no "Posted by", no poster animal on the stamp (the stamp shows the time and the going count), no name in the email or the "It's on" line. The proposer can cancel their own proposal from its details ("Cancel this proposal"), which the server checks against `posted_by`; nobody else sees that it is theirs beyond their own Going. Admin can see `posted_by` in admin Events.
The proposer's face does show among the going faces once they are going, the same as anyone's (founder accepted 2026-11-24).

### D4. Asks go once, through an outbox
`campus_ask(proposal_id, person_id, created_at, sent_at, attempts, last_error)`, unique (proposal_id, person_id). Rows are made in the same transaction as the proposal for every member except the proposer, and when someone joins an intent for each open proposal on it (with no email: `sent_at` set to the join time, the card alone shows it). A 15-minute cron (`/api/cron/campus-asks`, or a step in the existing `when` cron) sends the email through the Resend sender, behind a `CAMPUS_ASKS_SENDING=on` switch, copying the When outbox's claim/retry rules. The email has the intent, the day, time and place, Going and Can't links (signed, one-use per person and proposal), and "Leave this intent".
The card on the campus page is computed live: proposals ahead on intents the viewer is in, that they have not answered.
*Why:* the outbox pattern already works and is tested; computing the card live avoids a second state.

### D5. Going, Can't and "on"
Going = in the proposal's outing. Can't = a row in `campus_proposal_answer(proposal_id, person_id, answer='cant')`; pressing Going removes it, pressing Can't leaves the outing. A proposal is on when its outing has at least 2 people (`ON_AT = 2`). Being on changes only the look ("It's on", lit date tile); there is no lock. Only people in the intent can answer through the intent; anyone can still press I'm in on the listing itself as today.

### D6. Matching events (no model)
Keys are activity rows from `tagRow` (`words.ts` `SAME`). An intent's keys = the `tagRow` keys of its tags and title words that are activities. An event's keys = the `tagRow` keys of its title words that are activities, plus the first word of each `TABLE` row the title hits (`run` for a 5K) when that word is itself an activity. Broad words (exercise, workout, active, social, game, play, learn, chill, food...) never count. A match is any shared key.
An event is offered only if: it is shown (not waiting, not hidden, not cancelled), has a known place (`place_id`), starts more than an hour from now and within 14 days, is on the intent's campus, is not already a proposal on that intent, and the intent has had no matched proposal in the last 24 hours. Matching runs after a feed read, when the admin shows a waiting event, when a link plan is posted, and once for a new intent against upcoming events.
*Alternative:* `goodFor` words directly; rejected because "exercise" would tie every sport to every run.

### D7. Posting
The "+" panel becomes "What do you want to do?". The line is read as today (`lib/campus/line.ts`). With no time and no place it posts an intent. With a time and a place it posts the intent and its first proposal in one transaction. With one of the two, it posts the intent and opens Propose with the found one filled in. As the person types, up to one existing open intent on the campus sharing a key (D6) and with the most members is offered with "I'm in".
Limits: 10 open intents a person is in that they started; proposals count toward the existing three upcoming plans.

### D8. Retiring "When works?"
New plans always have a time. `campus_time_pick`, `time_open` and their code stay until no plan with `time_open` is left, then a later cleanup removes them. No data is changed.

### D9. Intent lifetime and finding
An intent is open while it has at least one member; when the last one leaves, `closed_at` is set and it disappears. Intents show on the campus page as their own rows (title, tags, count, "I'm in"; open intents ordered by members, then the newest), are found by search through their title and tags, and have a page `/c/[campus]/i/[id]` used as the share link. A signed-out visitor sees the title and the count, and Sign in to join.

## Risks / Trade-offs

- [A wrong match asks everyone] → activity keys only, broad words excluded, one matched proposal per intent per day, review still gates CampusGroups.
- [Email volume] → one ask per proposal per person; joining late sends no email; a person in many intents could still get several a day. Watch it; digest is a non-goal for now.
- [Silence lets a person send junk proposals unseen] → proposals count toward the three-plan limit, admin sees `posted_by`, and existing hide/cancel tools apply.
- [Two systems while old plans with no time live out their day] → old code paths stay untouched until empty (D8).
- [Matched event already has its own outings] → the intent's outing is separate (D2); friends outside the intent are not merged in.

## Migration Plan

One migration (founder runs it, one shared database for localhost and production): the five new tables and indexes, additive only. Code checks for `campus_intent` and falls back to today's posting when it is missing, as the feed review did (`reviewReady`). Emails stay off until `CAMPUS_ASKS_SENDING=on` is set in Vercel. Rollback: turn the switch off and drop the new tables; listings made as proposals stay as ordinary plans.

## Open Questions

- Ithaca has no places loaded: should a proposal there accept a typed place (today's rule), or should intents be Cornell Tech only at first? My call: typed place is fine on campuses without required places.
- Should "It's on" also email the people going (like "set it" did)? My call: no, the card changes and the outing already invites.
- Is two the right "on" number for every activity (a pickup game wants more)? My call: two for the MVP, one constant.

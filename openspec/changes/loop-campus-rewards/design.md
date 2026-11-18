## Context

The founder approved the product on November 17, 2026 and shaped it over two days into one screen, "This week", in `public/demo/mockups-campus-usecases.html` (screen 1). On November 18 the founder said to build it for real, starting with that screen, to give it lime-based colours, and to table the current site behind an admin login that only the founder has.

The mockup is the reference for layout, wording and behaviour. Where this document and the mockup disagree on how something looks, the mockup wins; where they disagree on what is stored or allowed, this document wins.

What exists today, from a read of the code:

- Sign-in is Clerk, at `/groups/sign-in`. `proxy.ts` runs Clerk on `/emba`, `/groups`, `/e/`, `/a/` and `/api/emba/documents/`. The signed-in person comes from `getPortalPrincipal` (`lib/emba/portal-session.ts`) as a `Principal` with a `personId`.
- `app/page.tsx` redirects `/` to `/groups`.
- Every team event (`emba_team_event`) must belong to a group. There is no public list, no check-in and no calendar import in the root app (export only, with `ical.js`). There is no payment code.
- Crons run from `vercel.json`.
- The current look lives in `app/loop.css`, with `--lime: oklch(96.4% 0.19 117)` and navy ink.

What each source offers, checked on the web on November 17, 2026:

- **CampusGroups:** each school has an `/ics_helper` page with a calendar feed of all public events, and one per group. One school's help page says the feed updates every 3 hours. No public API for registering was found.
- **Luma:** calendar feeds for any public calendar. It has a registration button an organizer can embed and an add-guests API, both of which need the organizer's side.
- **Posh:** no feed and no public events API.

The pilot this serves: four schools set up from the first day (Cornell, Columbia, NYU, CUNY), a few rewards entered by hand at each, three groups.

## Goals / Non-Goals

**Goals:**

- A student opens Loop and, on one screen without scrolling, sees a few things worth doing this week, each led by what going as a group gets them.
- A student can go from that screen to a reward shown at a counter: in, invite, check in, use.
- Every check-in adds to a record of who came with whom, which is what rewards and levels are counted from.
- The founder can run the pilot by hand from one admin page.
- The current groups site stays intact for the founder and out of sight for everyone else.

**Non-Goals:**

- Money through Loop, holds, fees or a subscription.
- Screens 2, 3 and 4 of the mockup.
- Organizers or businesses with accounts, claims, their own reward forms or counts.
- Proof that a person is physically there. A tap is taken on trust.
- Real registration with a feed's own platform.
- A solo price, a countdown, a fill clock, locked rewards, reasons for a ranking, category tabs, a "show all" button, a phone app, notifications.

## Decisions

Decisions the founder made are marked **Founder**. The rest are my calls and are open to correction.

### D1. First slice is "This week", end to end (**Founder**)

This change builds screen 1 for real: sign in, events from feeds plus plans people post, "I'm in", invite, check in, group rewards and levels. The club quota, the team dinner and paying are later changes.

### D2. New tables, separate from team events

Campus listings get their own tables and their own module folder, `lib/campus/`. They do not reuse `emba_team_event`.

Why: a team event must belong to a group and is visible to members only. A campus listing belongs to no group and is public. Making group membership optional on team events would touch every access check in `lib/emba/`.

What is reused: Clerk sign-in, `getPortalPrincipal` and the person id it returns, `lib/db.ts`, and `ical.js`.

### D3. Tables

| Table | Holds |
|---|---|
| `campus` | slug, name, timezone, email domains |
| `campus_person` | person, campus, when placed (one campus per person) |
| `campus_feed` | campus, source (`CampusGroups` or `Luma`), feed address, on or off, last read and last result |
| `campus_place` | campus, name, other names it goes by, latitude and longitude |
| `campus_listing` | campus, origin (`feed`, `member` or `hand`), feed and feed item id, title, about, host name, place text and matched place, start and end, the "good for" words (D10), who posted it, cancelled and hidden flags |
| `campus_reward` | campus, giver name, kind (`group` or `building`), reward text for each of the three levels, hidden flag; for `group`: the listing or host name it rides on and the head count; for `building`: the rule and its number (D8) |
| `campus_outing` | listing, share token, who started it, whether it is open to anyone |
| `campus_outing_member` | outing, person, when they said they were in, whether they came in by "Register me", when they checked in |
| `campus_invite` | outing, who invited, who was invited, when |
| `campus_reward_use` | reward, person, the outing if it was a group reward, when it was marked used |

A person's level and their progress on building rewards are not stored. They are counted from `campus_outing_member` by query.

### D4. Routes

| Route | Screen | Sign-in |
|---|---|---|
| `/c/[campus]` | This week | Not needed to look |
| `/c/[campus]/post` | Post a plan | Needed |
| `/o/[token]` | The share link: This week with that event's panel open and "Join" | Needed to join |
| `/c/admin` | Founder: campuses, feeds, places, listings, rewards | Admin (D17) |
| `/` | By default (founder, November 17: on by default; `LOOP_FRONT=groups` turns it off): the sign-in door for a signed-out visitor, This week at their own school for a signed-in person (D21) | Not needed to see the door |

`proxy.ts` runs Clerk on `/c` and `/o`. Pages render for signed-out visitors; every action requires a signed-in person.

The opened event is page state, not a route of its own, so that opening and closing never leaves the screen. The share link is the one address that points at an event.

### D5. One list (**Founder**)

There is one list of events. No split between places and clubs, and no category tabs. An event comes from a feed, from a person, or from the founder by hand, and they sit in the same row.

### D6. An outing is one group's visit to one event

Saying "I'm in" or "Register me" puts a person in an outing for that event. People who join the same outing are the group the reward counts.

Which outing a person lands in:

- From a share link: that link's outing.
- From the screen, when someone they know already has an outing on that event: that outing. With several, the one with the most people they know.
- Otherwise: a new outing that they start.
- A plan a person posts has one outing, open to anyone signed in. The poster asked for company.

A person is in at most one outing per event. Joining a second moves them.

"Someone they know" means a person who shares a group with them in the existing groups data, or who has checked in on an outing with them before. It is used for three things only: which faces and first names a person sees, which outing "I'm in" joins, and who is suggested in "Invite people".

Why an outing and not one count per event: the reward is for coming with your people, and the record that matters is who came with whom. One count per event would let two hundred strangers at a club fair unlock each other's reward.

### D7. Checking in is a button with a time window (**Founder:** a simple button; no QR, no location)

"Check in" works from 30 minutes before the event's start until its end, in the campus timezone. An event with no end time ends two hours after its start. Outside the window the ticket shows no check-in button. Nothing else is checked.

### D8. Rewards ride on events (**Founder**)

Two kinds, both given by a named venue or organizer:

- **Group reward.** Rides on one event, or on every event with a given host name. It names a head count. When that many people of one outing have checked in, the reward shows for everyone checked in on that outing.
- **Building reward.** Earned by a person's activity over time. Three rules, which cover every reward in the mockup:
  - a number of outings of any kind ("$5 off any order, for 10 outings");
  - a number of outings on events carrying a given word ("20% off Brooks running shoes, after 5 group runs");
  - the same group at the giver's events in each of a number of weeks ("a free drink each, same group, 3 weeks").

An outing counts toward a building reward and toward a level only when the person checked in and at least one other person of the same outing checked in too.

**Founder:** no solo price beside the group reward, no countdown and no clock on filling the group. A reward a person cannot have is not shown: nothing locked, nothing greyed.

An event with no reward claims none: its ticket has a quiet lower half that says who is going, or that nobody the person knows is going yet.

In this change the founder enters every reward on the admin page. Hosts setting their own is a later change.

### D9. Using a reward

- Group reward: once it unlocks, the top bar shows it with "Show at the counter" and the current time, so a screenshot is visibly old. Any checked-in member marks it used once; after that it says it was used and when.
- Building reward: once earned it reads "Ready" on its coupon. The person opens it, shows it, and marks it used once.

Why a member marks it and not the cashier: the venue needs no account, device or training in the pilot.

### D10. Search by meaning, done with words (**Founder:** a few best matches by meaning, not an exhaustive list; my call on how)

Each listing carries up to twelve plain "good for" words (exercise, outside, food, study, tonight and so on). They are assigned when the listing is created, by rule: a fixed table in `lib/campus/words.ts` maps words found in the title, the about text and the host name to "good for" words (a run gets exercise, fitness, outside; a dumpling night gets food, eat, social). The founder can edit a listing's words on the admin page. No model call.

A search splits what was typed into words, drops filler words, and scores each listing: a word that starts a word in the title, host or place counts 3; a word that starts a "good for" word counts 2.

Each listing also has a pull for the viewer, the same as the mockup: they are in it (4), people they know are in it (1 each, up to 2), it has a reward (2), it is one person short of unlocking (2), it is today (1).

- Nothing typed: the five listings with the most pull are the best, shown in time order. The rest follow in the same row after a marker that says how many more there are this week.
- Something typed: rank is twice the score plus the pull. The best are those within 60% of the top rank, at most four. The other matches follow after a marker that says how many looser matches there are.
- "All of CampusGroups": every CampusGroups listing this week in time order, or every one that matches what was typed. No best, no marker.

**Founder:** ranking is silent. No reason chips, no scores, no "because you" lines.

Why words and not embeddings or a model: fourteen to a few hundred events a week, a pilot on one campus, and a rule the founder can read and correct. If the table proves too thin, a model can assign the same words at import without changing search.

### D11. Feed events register inside Loop (**Founder:** source label, no link out, register in the app; my call on what registering does)

A feed event shows a small label with its source name. Loop shows no link to the source's page.

"Register me" records the registration in Loop: the person is in an outing for that event, marked as registered. Loop does not tell CampusGroups or Luma. Real registration needs the school's agreement for CampusGroups (no public API was found) and the organizer's side for Luma. The wording must not say the organizer has been told.

Risk accepted for the pilot: an event that requires registration on its own platform will not know the student is coming. The founder picks pilot events where that does not matter, or tells the organizer by hand.

### D12. Feed import (**Founder:** pull events in from CampusGroups and Luma)

A campus has any number of calendar feeds. A cron route runs every hour, reads each feed that is on with `ical.js`, and upserts events by feed and feed item id for the next 30 days. Changed titles, times and places update. Events gone from a feed are hidden, not deleted, so outings on them keep their event. A failed feed leaves its events as they were, is recorded on the feed, and does not stop the others. "Good for" words set by hand survive a re-import.

The same event can arrive from two feeds. It is shown twice in this change; the founder can hide one.

### D13. Places and the map (**Founder:** a map in the opened event)

The founder keeps a short list of the campus's places with coordinates. A listing's place text is matched to that list by name. The opened event shows an OpenStreetMap embed centred on the matched place, with the place name and the room or meeting point under it. An event whose place is not on the list shows its place text and no map.

The mockup shows a walk time on each ticket. That needs to know where the student is, which this change does not ask. Walk times are left out. See Open Questions.

### D14. Plans posted by people (**Founder:** let people post things like "running at 5" or a study group)

Any signed-in person posts a plan: a title, a start within the next 14 days, and optionally an end, a place and a line about it. The poster is counted in. The plan appears at once, with no approval, with "Posted by" and their first name.

Limits: three upcoming plans per person. The poster can change or cancel their plan until it starts; the founder can hide any plan. No reporting button in this change; the pilot is small enough for the founder to read every post.

A plan has no reward of its own unless the founder attaches one. It can still count toward building rewards.

### D15. Levels (**Founder:** levels by usage, shown only on the avatar; the names and numbers are my call and not confirmed)

Member at 0 outings, Regular at 5, Insider at 15, counted as in D8.

- The level shows as a small numbered badge on the avatar in the top bar and nowhere else on the page.
- Pressing the avatar opens a level card: photo, name, level, progress to the next level, the three levels with what each gets.
- A reward has a text for each level. A higher level may get a better version. Each person sees only the version for their level.
- A reward that exists only for a higher level is not shown to lower levels at all.

### D16. The screen (**Founder**)

One screen, no page scroll where the window allows. Width is spent before height.

- **Top bar, one line:** the Loop mark, "This week", the person's groups by name, a live reward when one is unlocked, "Post a plan", the avatar with its level badge.
- **Search line:** the search box, then "Best for you" and "All of CampusGroups".
- **Count line:** what the row holds ("Your best 5 of 14 this week") and a few words to try.
- **The row:** ticket cards side by side, scrolled sideways with arrows. Upper half: time tile, title, who posted it or the source label with the host, the place, and "Details". Lower half, cut like a tear-off stub: who gives the reward, the reward, how close the group is, seats with faces, and one action. No "show all" button; nothing opens downward.
- **Details:** unfolds a panel to the right of the ticket, inside the row and as tall as the tickets: about, how it unlocks, when, who is going that the person knows, the map, and "Register me" or "Invite people". "Invite people" shows in the same panel: people the person knows with "Invite", and a link to copy.
- **Under the row:** "Rewards you are earning", as coupons: giver, reward, progress, and "Ready" when earned. This is option A of three the founder was shown. With none, the shelf is not shown.

The section under the top bar takes exactly the height the window has left. On a short window the page may scroll rather than clip.

Who sees what in the top bar when the groups site is admin only is an open question: see D17 and Open Questions.

### D17. The current site is tabled behind the admin (**Founder:** admin only, fully; only the founder is admin)

**Changed by the founder on November 17: this is on by default.** It was first built behind `LOOP_FRONT=campus`. Now it applies unless `LOOP_FRONT=groups` is set, which is the way back.

By default:

- `/` shows the campus screen.
- The groups site opens only for the admin: `/groups` and everything under it, including the "How we got here" archive, plus the other pages of the current site that lead into groups (`/emba`, `/e/`, `/a/`, and any others found when the task is done; the task lists them before gating).
- Anyone else who opens one of those pages, signed in or not, is sent to `/`.
- Sign-in stays reachable. A new `/sign-in` serves the campus screen; `/groups/sign-in` keeps working for the admin and sends everyone to the right place after.
- The admin is whoever is listed in `LOOP_ADMIN`: Clerk user ids or email addresses, one in practice. The check is made in `proxy.ts` and again on the server in the groups layout and in the admin page, so a missed path in one place does not open the site.
- The admin sees an "Admin" entry on the avatar's card with three links: the campus admin page, the groups site, and "How we got here". Nobody else sees it. The founder asked for a mockup of signing in as admin; that mockup is made before this part is built.
- The legal pages, the demo pages under `/demo`, crons, and the routes that members' assistants connect through are not gated.

#### What is gated, as built (task 7.2)

Pages that lead into groups. With the flag on, each opens for the admin only; everyone else is sent to `/`:

- `/groups`, `/groups/new`, `/groups/archive` ("How we got here"), `/groups/connections`, `/groups/metrics` and its export, `/groups/request`, `/groups/reach`, `/groups/reach/answer/[token]`
- `/groups/[namespace]` and under it `add`, `organize`, `team`, `resources`, `resources/[id]`; the same six under `/groups/[namespace]/in/[slug]`
- `/emba`
- `/e/[token]` (a shared team event) and `/a/[token]` (a shared ask)

Actions: every exported action in the 15 action files under `app/groups` and `app/emba`. All of them ask `getPortalPrincipal` who is calling, and with the flag on that answers "nobody" for anyone but the admin. The two that work without sign-in (previewing a request link, answering from a personal link) check `closedToCaller` first.

Left open on purpose: `/groups/sign-in`, `/emba/sign-in`, and `/groups/reach/stop/[token]` with its action (the stop link in an email must always work).

Where the check is made: in `proxy.ts` (`leadsIntoGroups`), and again on the server in `getPortalPrincipal`, which every groups page, the groups layout and every groups action already calls. A test (`app/campus-gate-walk.test.tsx`) finds the pages and action files on disk and walks each as a signed-in non-admin and as a signed-out visitor with a database that fails if touched, so a page added later is walked too.

Not gated, in both states:

- Scheduled jobs: `/api/cron/daily`, `/api/cron/reach`, `/api/cron/emba-documents`, `/api/cron/campus-feeds` (cron secret).
- Members' assistants: `/api/mcp`, `/api/mcp/team`, `/api/emba/knowledge`, `/api/emba/memory`, `/api/emba/documents/[id]`, `/.well-known/oauth-protected-resource` (their own tokens).
- Token addresses used by other programs: `/api/calendar/[token]/loop.ics`, `/api/reach/stop/[token]`.
- The legal pages and `/demo`.

Not gated and not decided: `/b`, `/p`, `/trip`, `/trips` and `/api/trip` (the cohort trip board). They do not lead into groups, so they were left alone. See Open Questions.

When `LOOP_FRONT=groups` is set, everything behaves as it did before this change and the campus screen is reachable at `/c/[campus]` only. That is both how the work is built without disturbing anyone and how the switch is undone.

What this costs: every current member, including the founder's Team 1 teammates, loses their group pages on the site the moment the flag is turned on. Share links to team events and asks stop opening for them. Their assistants' connection to Loop keeps working by default (Open Questions).

### D18. Colours by role (**Founder:** lime green from the groups look in place of coral)

The campus screen has its own stylesheet and its own tokens, named by role so the values can be set once the founder picks from the mockup options:

| Role | Used for | Starting point |
|---|---|---|
| field | top bar, time tiles, the stub of a ticket with a reward | lime, `oklch(96.4% 0.19 117)` |
| field shadow | the hard shadow under tickets and coupons | a darker lime |
| ink | type, outlines, the selected pill, the ready coupon | navy, `oklch(35.4% 0.095 252)` |
| action | the one main button on a ticket, "Post a plan" | to be picked |
| paper, page | ticket face, page background | the pale neutrals of the groups look |
| line, mute | hairlines, secondary type | from the groups look |

Rules that do not depend on the pick: type on the field colour meets contrast in ink; the action colour is used for actions only; no pure black or white. `app/loop.css` is not edited.

### D19. What people see of each other

- Signed out: events, rewards and how many are in. No names, no faces.
- Signed in: first names and photos of people they know (D6) who are in an event, and the first name of whoever posted a plan. Everyone else is a count.
- In an outing: first names of the others in it and who has checked in.

Photos come from the sign-in account. A person with none shows their initial.

Nothing on the campus screen mentions advising, counsellors, or any signal sent to staff.

### D20. Inviting

"Invite people" lists up to four people the person knows who are not already in, and a link to copy. Pressing "Invite" records the invite. The invited person then sees that event among their best, with the inviter's face in its seats. No email or text is sent in this change; the copied link is how an invite travels outside Loop.

### D21. Four schools and one door (**Founder:** Cornell, Columbia, NYU and CUNY from the start; the sign-in changes by itself from the email; the card should look like the groups sign-in, smaller)

The four campuses and their email domains are seeded by the migration. A campus holds a list of domains; a subdomain counts (`stern.nyu.edu`, `baruch.cuny.edu`).

The sign-in card is the Clerk sign-in the groups site already uses (Google, or, email, Continue), drawn smaller on the right of the door, with a school menu added. The menu is a convenience: it switches as the email is typed and can be set by hand, but it decides nothing.

My calls, open to correction:

- What decides a person's school is their verified email after sign-in, not the menu. This covers Google sign-in, where no email is typed first.
- A person is placed at one campus the first time they sign in and stays there (`campus_person`).
- A verified email at none of the four schools is not placed at a campus and sees the list of schools. The admin is the exception and can open any campus.
- `LOOP_CAMPUS` is no longer needed: `/` shows the door to signed-out visitors and sends a signed-in person to `/c/[their campus]`.
- Custom fields inside Clerk's sign-in component may not be possible. If not, the school menu and email field are our own form that hands the address to Clerk. To be checked against the Clerk docs before building.
- Alumni and other school domains (`alumni.`, `med.cornell.edu`) count as that school, because they end in its domain.

## Found and decided while building

### The schools' feeds (task 1.3), checked November 17, 2026

| School | Feed | Opens without a login | What it carries |
|---|---|---|---|
| Cornell | `https://cornell.campusgroups.com/ical/cornell/ical_cornell.ics` | Yes | 718 events in the next 30 days. Host on all. A real place on 192; the rest say "Sign in to download the location", which the importer stores as no place. |
| Columbia | `https://groups.gsb.columbia.edu/ical/cbs/ical_cbs.ics` (Business School only, CampusGroups) | Yes | 93 events in the next 30 days. Host on all, a real place on 15. No open feed was found for the whole university. |
| NYU | `https://engage.nyu.edu/events.ics` (NYU Engage, not CampusGroups) | Yes | 689 events in the next 30 days, a place on all, host on 673. The list source for NYU should read "NYU Engage". |
| CUNY | None found | n/a | No open calendar feed. CUNY starts with posted plans and events entered by hand until one is found. |
| Luma | `https://api.lu.ma/ics/get?entity=calendar&id=cal-...` per calendar | Yes | Tried on one public calendar: place and host on every event. Which calendars belong on each school is the founder's pick. |

The reader was run over the downloaded files of all four feeds, and seven events were compared by eye with their source lines (time, place, host): all matched. Running it into the hosted database waits on the migration (1.7).

### My calls, not confirmed by the founder

- **Stored:** the migration is `20261117000000_campus.sql`. A campus has a `list_source` (the name in "All of ..."). A listing has `hidden_at` (the admin hid it) apart from `left_feed_at` (the feed dropped it), so an unhide does not bring back an event that left its feed.
- **Who knows whom:** shares a group whose membership is live, or has checked in on the same outing. Being in the same outing without checking in does not count afterwards.
- **One school each:** a person acts only on their own campus; the admin on any. A person is placed once, by their verified email, and a later address does not move them.
- **Photos:** read from the sign-in account when the page is drawn. None is stored in Loop.
- **Rewards:** a reward "on a host" matches an event whose host or place name equals the giver's host name. A building reward is used once per person. A ticket shows a building reward's steps only for the word and weeks rules; the any-outings rule shows on the shelf alone.
- **Order of the row:** an invite or being in adds 4 to an event's pull, each known person going adds 1 up to 2, a reward 2, one seat short of unlocking 2, today 1. None of it is shown.
- **Time words:** weekday, "today", "tonight", "weekend" and the part of the day are added when the screen is drawn, so "tonight" is always tonight.
- **Left out:** walk times on tickets, and "saved" or "used" totals on the level card.
- **Register wording:** "Register me" says the source is not told, since Loop only records it.
- **Colours:** the mockup's "Lime 1" values are in `app/c/campus.css` as starting values under the D18 role names. Measured contrast: ink on the field 14.5, second text on the field 6.6, text on the action colour 6.5, quiet text on paper 6.8.
- **Sign-in card:** Clerk's sign-in component cannot hold a custom field, so the school menu sits above Clerk's own form (Google, email, Continue) and follows what is typed in its email field. The email label is restyled through Clerk's appearance settings; that has not been seen against a live Clerk and needs a look on a preview.
- **The admin by email:** when `LOOP_ADMIN` holds an email address, `proxy.ts` asks Clerk for the signed-in account's verified primary email and keeps the answer for a minute.
- **Admin sign-in mockup (7.1):** not made. The use-cases mockup already shows the signed-out door and the admin's card; the Admin entry and its three links were built from the spec. Say if a separate mockup is still wanted.

### Changed after the two independent reviews (tasks 4.9 and 7.7)

Fixed, each with a test in `lib/__tests__/campus-edges.test.ts`:

- A reward unlocked near the end of an event vanished when the event ended. A person's checked-in event that carries a group reward now stays on their screen for 24 hours after it ends, so it can be shown and marked used. (My call: 24 hours.)
- A higher level's reward text could reach a lower-level member once the outing had used it, and a mixed-level outing could use two rewards. An outing now uses one reward once, whoever marks it, and each member sees only their own level's words, or nothing.
- A plan posted 8 to 14 days ahead was on nobody's screen, so its poster could not change or cancel it. A person's own plans and the events they are in for beyond the week now show on their own screen. Others see a plan when it enters the week. (My call.)
- A plan could end years after it starts and sit in the list. A plan now ends within a day of its start. (My call.)
- The top bar showed a used reward ahead of one still to use.
- A building reward could be marked used with another school's reward id.
- A reward on a name now rides on events at the place of that name as well as events that name hosts, as written above.
- A used building reward stays on the shelf for a week saying when it was used. (My call: a week.)
- Search: "theater" matched every title containing "the". A typed word now matches a title, host or place word it begins; only a good-for word may be the shorter one ("running" finds "run"). The calendar's name is no longer searched.
- Leaving and joining the same outing at the same moment could drop the person joining. Leaving now takes the same hold as joining. (PGlite runs one connection, so this is not covered by a test.)
- The link previews of `/e/[token]` and `/a/[token]` read the event or ask without the admin check. They are closed with the pages.
- "Delete my data" left every campus record. It now removes the person's school, outings, check-ins and invites, cancels their upcoming plans and takes their name off past ones.
- The hourly read: one read of a feed at a time, events that ended over two days ago are left alone, and a feed over 30 MB is refused.
- The admin's reward form lost a reward's event once that event had ended.
- A signed-out visitor now has "Post a plan" in the bar; it leads to sign-in and back to the form.

Known and left, for the founder to weigh:

- The admin check inside `proxy.ts` with a live Clerk session has no automated test (the server-side check behind it does). Demo 6 on a preview is its test.
- A poster who leaves their own plan loses "Change this plan" until they press "I'm in" again.
- The feed reader does not expand repeating events from a rule; the feeds checked list each occurrence on its own.
- The feed address is typed by the admin and fetched as given (redirects followed).
- The data export on the groups site does not include campus records.
- Tickets show a building reward's steps for the word and weeks rules only; the any-outings rule is on the shelf.

## Risks / Trade-offs

- [Turning the flag on cuts off current members of groups] → One flag turns it back. The founder tells Team 1 before turning it on. The assistants' connection is left alone by default.
- [A gated path is missed and the old site shows] → The check runs in `proxy.ts` and again on the server in the groups layout. A test walks every page of the current site as a non-admin.
- ["Register me" does not register with the organizer] → Wording says the spot is saved in Loop. The founder picks pilot events accordingly.
- [A tap is not proof; people could check in from home] → Accepted for the pilot. The cashier sees who is at the counter, and the window limits when it works.
- [A member marks the reward used, so a group could skip it and reuse it] → The time shown and one outing per event limit it. Move the mark to the venue if one complains.
- [Word matching misses what a student means] → The founder edits words by hand; "All of CampusGroups" is always complete; a model can assign words later.
- [Anyone can post] → Three upcoming plans per person, sign-in required, the founder can hide any plan.
- [Showing first names and photos of people you know going] → Limited to people who share a group or have been out together. The privacy page is updated before the pilot.
- [One screen does not fit a small laptop] → The page scrolls rather than clips. Checked at 1400 by 760 and at phone width before the pilot.
- [Rewards entered by hand do not scale] → Accepted. Hosts come in a later change, once the pilot shows what they want.
- [This is a second events model beside team events] → Accepted. Joining them is a later decision.

## Migration Plan

1. One additive migration with new tables only. The founder applies it by hand on the hosted database.
2. The campus screen is the front door as soon as this is deployed (founder, November 17). So before deploying: apply the migration, and set `LOOP_ADMIN` in the hosting dashboard, or nobody can open the groups site.
3. To go back: set `LOOP_FRONT=groups` and redeploy. The tables can stay.

## Open Questions

- Do members' assistants keep their connection to existing groups once the site is admin only? Not answered. Default in this change: yes, those routes are untouched.
- The top bar shows the person's groups by name, but only the admin can open a group. Default in this change: the group links show for the admin only. Should "your groups" on the campus screen come to mean something else?
- Are the level names and numbers right (Member 0, Regular 5, Insider 15)?
- Which exact colours: the pick from the mockup options, including the action colour.
- For each of the four schools: is its events feed readable without a login, and which Luma calendars belong on it? Not every school uses CampusGroups (NYU and Columbia may use another system); to be checked per school, and the "All of CampusGroups" label would then carry that school's source name.
- A person with no school email is let in (founder, November 17) and shown a default campus. My call: that campus is Cornell, and they can use it like anyone there. Is Cornell the right default?
- Walk times on tickets: leave out, or ask for the student's location?
- Should an invite also send an email?
- Should the demo pages under `/demo` stay public?
- With the flag on, should the trip board (`/b`, `/p`, `/trip`, `/trips`) stay open? It does not lead into groups, so it was left as it is.
- CUNY has no open events feed and Columbia's covers the Business School only: start those two with posted plans and hand-entered events, or look for other sources first?
- Phone or email sign-in for students: a Clerk dashboard choice for the founder.

## 1. Before building

- [ ] 1.1 Re-read this change against what the club pilot showed and revise the specs first. Settle the open questions in design.md with the founder: the default number needed, the tie rule, minimum notice, names in invites, and the future of the cohort board.
- [ ] 1.2 Founder: approve a calendar-file library, or agree to generate the files in-house.
- [ ] 1.3 Write the single migration: travel entries; `idea`, `planned`, `cancelled` and `lapsed` states, proposer, number needed and offered days on events; calendar entry sequence numbers; feed tokens. Run it on PGlite with the full suite.
- [ ] 1.4 Founder: apply the migration by hand on `supabase-loop`.

## 2. Travel (demo 1)

- [ ] 2.1 Tests first, then save, change and delete one's own travel entry; nobody writes another's; at least an arrival or a departure.
- [ ] 2.2 Arrivals read in time order with last-changed dates and the two-hour marks for the caller; members and followers only.
- [ ] 2.3 Connector tools for saving travel and reading arrivals; site section on the group page.
- [ ] 2.4 Leaving and deletion remove the entry; export includes it.
- [ ] 2.5 Founder demo 1: two accounts state flights; each asks their assistant who lands near them.

## 3. Ideas and plans (demo 2)

- [ ] 3.1 Tests first, then propose an idea with number needed, optional time, place and offered days; proposer counted in; 5 open per member.
- [ ] 3.2 "I'm in" on ideas through the existing interest mark; who is in and how many more are needed.
- [ ] 3.3 Idea becomes a plan inside the deciding write under the group lock. Concurrency test: two join at once, one transition, one set of invites.
- [ ] 3.4 A plan stays a plan after a drop-out; proposer and organizers can change and cancel; no revival.
- [ ] 3.5 Missing day: Loop opens one pick-dates ask to those in, closes at 48 hours or all answered, most answers sets the day, proposer breaks a tie. Missing place: tell the proposer, open no ask. Test that a second ask never opens.
- [ ] 3.6 Lapse rules; transitions enter the change sequence; `waiting` and `whats_new` show ideas one short of their number to members not yet in.
- [ ] 3.7 The day read on the site and as a connector tool, ideas closest to their number first.
- [ ] 3.8 Leaving: removed from ideas and plans, own open ideas lapse, own plans pass to organizers.
- [ ] 3.9 Independent review with a fresh context of sections 2 and 3 against `trip-travel` and `group-ideas`.
- [ ] 3.10 Founder demo 2: propose an idea from Claude, join from two other accounts, watch it become a plan; propose one with no day and see the ask open.

## 4. Calendar (demo 3)

- [ ] 4.1 Tests first, then invite generation for a plan: name, time, place, group; no other member named.
- [ ] 4.2 Updates and cancellations against the same calendar entry; late joiner gets the invite; a drop-out gets their own cancellation.
- [ ] 4.3 Send invites by email through the outbox to members whose reach choice allows it; organizer option to send a fixed event to interested members.
- [ ] 4.4 Per-member feed address: fixed events and plans only, replaceable, dead after leaving. Test that it carries no names, ideas or travel.
- [ ] 4.5 Check invite, update, cancellation and feed in Google Calendar, Apple Calendar and Outlook; record results in `calendar-checks.md`.
- [ ] 4.6 Founder demo 3: a plan lands in a real calendar, moves when its time changes, and disappears when cancelled.

## 5. Verification

- [ ] 5.1 Types, lint on changed files, the full suite, and one production build at the end.
- [ ] 5.2 Independent review of the whole diff against the three specs; no open blocker or major.
- [ ] 5.3 Run one real trip or outing group through it; record ideas proposed, ideas that became plans, and invites accepted.

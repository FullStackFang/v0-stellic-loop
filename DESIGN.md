# Loop — the proposal board. Design.

*2026-10-21 · the current direction. Supersedes `PIVOT.md` (campus engagement
model) as the thing being built. `web/` (the campus MVP) stays as is; nothing
in it is deleted. The new app lives in `board/`.*

## What this is, in one paragraph

A shared board for one bounded group. First group: our own executive MBA
cohort, about sixty people, one WhatsApp group, a one-week international
residency in February 2027. Anyone posts a **proposal**: what, rough cost,
minimum number of people, optional deadline, optional day. Everyone else taps
**in / out / maybe**, and can change that any time. Names are visible to the
group. When the count of yeses reaches the minimum the proposal flips to
**ON**: the yeses get a text, the poster gets the list, and the poster takes
it from there. If it never reaches the minimum it **idles** on the board,
visible, with no chasing and no failure state. Nobody is on the hook for
something that didn't happen.

## Why this, why now

The campus pilot (`PIVOT.md`, `web/`) asks us to create value for students we
don't know, on a campus we don't run, and then prove it to an office that buys
measurement. Nothing has fired for a real person yet, and the path to anyone
feeling the value is months long.

The cohort has the problem in front of us right now. Planning anything
(holiday party, a shirt order, the add-ons around the trip, "Thailand after")
produces endless chatter about what we *could* do and nothing countable. The
same few people herd. Proposals die from embarrassment: posting makes you the
owner, and a yes to a half-formed plan is a commitment you didn't mean.

The threshold is the whole mechanism, and it is the same idea Loop has always
carried (quorum, ownerless anchors, "fire" before "join"). Posting costs the
poster nothing because the board owns the count, not them. A yes costs the
joiner nothing because it only binds once enough others say it. A WhatsApp
poll has a count; it has no threshold, kicks nothing off, and is buried by
Thursday.

The test is cheap and real: four months of ordinary cohort life, then one
dense week where things either happen or don't, then four weeks after to see
if the board survives the trip.

## The one distinction we cannot lose

**Threshold, not poll.** A proposal is fixed by the poster. Joiners answer it;
they do not negotiate it. If you want it on a different day, cheaper, or
longer, you post that version. Competing versions sit side by side as
separate cards, and the one that reaches its number is the one that happens.
Nobody picks. The moment a joiner can enter their own dates or budget into
someone else's proposal, we have rebuilt Doodle, and Doodle already fails at
this.

Decision-making survives, it just moves to where it's cheap: the poster
decides the details once it's ON, and the group decides between versions by
tapping in.

## Mechanics by which one use creates the next

Ranked on two axes: **intent** = how much the user has to mean to spread it
(none / low / medium / high), and **cost** = how much we have to build
(trivial / low / medium). Reach says what the mechanic grows: responses,
posters, roster, or new boards. Anything that needs an account, an app, or
money is dead on arrival and marked so.

### Tier 1 — build in v1, these are the product

**M1. Every proposal is a link that unfurls with its live count.**
"5 of 8 in · Hoi An suits · Tue". Sharing it anywhere is the invitation;
nobody has to explain it. Tapping "I'm in" from a number not on the roster
asks for a name, adds the person to the roster, and they land on the board.
The roster grows only by people joining things. *Intent: none (people share
links to invite friends already). Cost: medium, because of the unfurl cache
problem, solved below. Reach: responses + roster.* The brief's hypothesis 1,
kept whole.

**M2. The "one more" text.** When a proposal is within two of its minimum,
the poster and every yes get one text: "7 of 8 for Hoi An suits. One more and
it's on. Send it to someone: <link>". This is the strongest pull to share in
the whole system because the person asked has a concrete stake and a concrete
number. Sent once per proposal, never repeated. *Intent: low. Cost: trivial.
Reach: responses + roster.* Our addition.

**M3. Every ON text manufactures posters.** The text to the yeses ends with
"Want to run something? Post it: <link>". The moment someone has just seen
the board work is the moment they'll post. *Intent: none. Cost: trivial.
Reach: posters.* The brief's hypothesis 2, kept whole.

**M4. "Post a version of this."** On any proposal, one tap opens the post
form prefilled with it. Different day, lower minimum, cheaper, bigger. This is
how competing versions get made, and it turns "I'd come if it were Saturday"
from chatter into a card. *Intent: low. Cost: trivial (same prefill as fork).
Reach: posters.* Our addition; it is the in-group half of the fork.

### Tier 2 — build in v1, cheap, but spread is modest or slow

**M5. Fork: "Run this for your group."** On any ON or past proposal, one tap
creates a new board with the proposal prefilled. This is the only mechanic
that escapes the cohort (the section's board, the study group's, the next
cohort's). It needs intent, so it will be rare, but it's the only path to a
second group and it costs almost nothing once M4 exists. *Intent: high. Cost:
low. Reach: new boards.* The brief's hypothesis 3, kept, ranked honestly.

**M6. Maybe is a lead, not a vote.** Maybe is a first-class answer, shown on
the card ("7 in · 3 maybe · needs 8"), and when the proposal flips ON the
maybes get one text: "Hoi An suits is on. 8 in. You said maybe. In?" The brief
proposed a soft threshold ("8 in or 12 in+maybe"); rejected, because it makes
ON ambiguous and ON must mean one thing. Maybe lowers the cost of the first
answer and gives ON a second wave; it never counts toward the number.
*Intent: none. Cost: low. Reach: responses.* Hypothesis 5, modified.

**M7. The digest is a page, and the weekly text carries its link.** "3 open ·
2 close to kicking off · 1 went live". Forwarding it forwards the board. In a
single WhatsApp group it mostly gets forwarded into the same group, so this is
retention more than spread; still worth having because it is the board's
heartbeat and it's a page we need anyway. *Intent: medium. Cost: low. Reach:
responses.* Hypothesis 6, kept, ranked as retention.

**M8. Reopen at a lower number.** A proposal that didn't reach its minimum by
its deadline idles at "didn't reach 8 by Fri". The poster can reopen it with
a lower minimum in one tap, which re-sends nothing automatically but gives
them a fresh link to share. A second share moment for the proposals that
almost worked. *Intent: low. Cost: trivial. Reach: responses.* From the
brief's build list, named as a mechanic.

### Rejected

**Hidden names until you're in (hypothesis 4).** In a bounded cohort where
everyone already knows everyone, social proof ("Priya and Marcus are in") is a
far stronger pull than curiosity, and hiding names fights the brief's own
rule that names are visible. Names are visible to anyone on the roster. To a
number not on the roster, the unfurl shows the count only, which is privacy,
not virality.

**Soft threshold counting maybes.** See M6.

**Comments, sub-chats, reactions.** They make the board a second WhatsApp,
and they let a proposal be negotiated in place, which breaks threshold-not-
poll. Once it's ON, the poster takes it to WhatsApp.

**Availability profile ("I'm free Fridays") in v1.** Real, wanted, and the
first thing after the trip proves the board. It needs a profile surface and a
rule for reconciling "free" with "in". What ships in v1 instead is the half
that needs no profile: conflict-aware yeses (below).

**Anything with accounts, apps, push, payments, admin roles, or Partiful /
Luma / Splitwise integration.** Out, per the brief.

## The demand side (added 2026-10-21, after the first review)

The board alone still makes a poster guess. The founder's addition inverts
that: **people say what they want first, and planners post into a warm
room.**

- **Wants.** Anyone ticks the things they'd do ("Thailand after", "cooking
  class", "cohort shirts") and can add their own. A want is not a yes; it
  binds nothing. Each want shows its count to everyone.
- **Free days.** Each person marks the days they're free in the window that
  matters (the trip week; later, any week). If they connect a calendar, busy
  blocks mark days for them. This is the stated-availability feature from
  "rejected" pulled forward in its simplest form: days, not hours; a window,
  not a profile.
- **The warm room (planner view).** Aggregates only: how many want it, how
  many of those are free each day, typical budget, a suggested minimum. Never
  names. "Post this" opens the post form prefilled from the aggregate (best
  day, suggested minimum, typical cost). Posting from a want sends the link to
  the people who wanted it (**M9**: *intent: none, cost: trivial, reach:
  responses*). The poster is in automatically.
- **Visibility.** Each person chooses whether their name shows when they tap
  in. Off, they still count toward the number and appear as "+1 anonymous".
  Names only ever appear on proposals, never on wants.

What this does to the rest of the design: the board, threshold, SMS and
unfurl are unchanged. Conflict-aware yeses get a second input (your free days)
and the post form gets a prefill. "No availability profile in v1" is replaced
by "days in a window, no hours, no recurring rules". The calendar connection
is the one piece that needs an OAuth flow; it ships after the manual day
strip works.

A click-through of this version is at the repo root as `quorum.html`
(working name, throwaway), deployed with the rest of the root demo.

## What ships (v1, before the trip)

Each item is shippable on its own; build in this order.

1. **Proposal page + respond + threshold.** Post form (title, one line, rough
   cost as text, minimum, optional deadline, optional day and time) in under
   30 seconds. Behind a "more details" fold, all optional: place with a map
   link, any number of links (website, Google Doc, booking page), and longer
   notes. Links render as chips on the proposal page with a cached preview.
   Details belong to the poster; joiners read them, never edit them. Anything
   with a day gets "Add to calendar" (an `.ics` with the proposal's facts,
   tentative until ON), and the ON text carries that link. Respond in / out / maybe with one tap. First answer from a new
   number asks for a name and creates the person. Threshold logic: count of
   yeses reaches minimum → ON. Names of yeses and maybes on the page.
2. **The board.** One link per group. Open proposals sorted nearest-to-
   threshold first, then ON, then past and idled. Pinnable.
3. **Unfurl.** OG image per proposal, regenerated on every answer. See
   "the unfurl problem".
4. **SMS.** Magic link so a person can change their own answer from any
   device. ON text to yeses (with M3's CTA). List to the poster. The "one
   more" text (M2). The maybe nudge on ON (M6). Weekly digest text (M7).
5. **Conflict-aware yeses.** Every yes carries the proposal's day. Tapping in
   on something that overlaps a day you've already said yes to shows "You're
   in for Hoi An suits that day" and lets you proceed or switch. When a
   proposal flips ON, the ON text names any other yes of yours on that day.
   No profile, no stated availability; derived entirely from your answers.
6. **Fork and versions.** M4 ("post a version") on every proposal; M5 ("run
   this for your group") on ON and past proposals, creating a new board.
7. **Digest page** per group, with the weekly text.
8. **Stats page.** See instrumentation.
9. **Seed script.** Roster from a CSV of name,phone; five proposals.

### The unfurl problem, solved properly

WhatsApp and iMessage cache a link preview per URL, for a long time, and do
not re-fetch when the page's `og:image` changes. So "regenerate the OG image
on every answer" alone does nothing for a link already in the chat.

The solution is that **every share mints a fresh URL**, and the preview is
exact at the moment of sharing:

- The share button (and every link we put in a text) produces
  `/p/<id>?s=<token>`. The token is unique per share, records who shared and
  when, and is the attribution key for the virality number.
- Because the URL is new, the chat app fetches a new preview. The page sets
  `og:image` to `/p/<id>/og?v=<response-count>` and `Cache-Control: no-store`,
  so the image is correct as of that share, and the page itself is always
  live on tap.
- `rel=canonical` points to the bare `/p/<id>` so the proposal has one
  identity.
- A link that's been sitting in the chat for a day shows the count as of when
  it was shared. That is the honest limit, and it is fine: the number that
  matters is live on tap, and the "one more" text (M2) re-shares with a fresh
  count exactly when the count matters.

### Identity

A person is a phone number plus a name. No accounts, no passwords. A
long-lived cookie on the device is the whole session. One person can be on
many boards (a forked board shares nothing with its parent except the
prefilled proposal; the person record is global by phone number so
conflict-aware yeses work across boards).

**Verification happens only where impersonation is possible.** A number
nobody has seen before cannot be impersonating anyone, so its first answer
goes through with no round trip: name, number, tap, done, cookie set. A
number already on a roster, answering from a device with no cookie, gets a
one-time SMS code before the answer is recorded; after that the cookie
covers everything. Strangers get zero friction; existing people are
protected. The magic link in texts carries the same cookie-setting token so
tapping a text never asks for a code.

**Who sees names.** The proposal page and the board show the names of yeses
and maybes to anyone who opens them; the group link lives in the WhatsApp
group, so holding it is membership. The unfurl (the OG image) shows the
count only, because it is the thing that travels outside the group.

### Rules the state machine needs

- **The poster is in.** Posting counts as a yes; they can change it like
  anyone else.
- **ON is a latch.** Once a proposal reaches its minimum it stays ON.
  `threshold_reached` and the ON text fire exactly once. If a yes drops out
  afterwards the card reads "7 in · ON" and the poster gets one text ("Marcus
  dropped. 7 in."); nobody else is told. Yeses that arrive after ON are
  counted and see the ON state on the page; the poster's list is a live page
  linked from their text, not a snapshot.
- **Deadline and day.** No deadline and no day: the proposal stays open
  indefinitely, which is the brief's intent. A day with no deadline: the day
  is the deadline. A deadline: evaluated at the end of that day in the
  board's timezone (set at board creation, default America/New_York).
  Idling is computed at read time; the `proposal_idled` event is written by
  the daily cron. No text is sent on idle. Ever.
- **Past.** An ON proposal with a day becomes past after that day. An ON
  proposal with no day stays ON until the poster closes it. Open proposals
  can also be closed by the poster; a closed proposal shows as past, is
  distinct from idled in stats, and cannot be reopened (post a version).
- **Pinnable** means the board URL is stable and carries no token, so it can
  be pinned in WhatsApp. Nothing on the board itself is pinned; the sort is
  the sort.
- **Digest recipients** are the people who have posted or answered on that
  board, not the CSV-seeded people who never have. A STOP reply sets an
  opt-out on the person and silences every text except the magic link they
  ask for themselves. A week with nothing open and nothing newly ON sends no
  digest.

### Instrumentation (this is the product)

Every event is a row with timestamp, person, proposal, board, and **source**.
Source is one of: `group_link`, `proposal_link` (with the share token and the
sharer), `digest_link`, `on_text`, `one_more_text`, `maybe_nudge`, `fork`,
`seed`. Events: `proposal_posted`, `response` (with in/out/maybe and the
previous answer), `threshold_reached`, `proposal_idled`, `proposal_reopened`,
`fork_created`, `person_added` (with the proposal that brought them),
`share_minted`, `text_sent`.

`/stats` answers, for a board and for all boards:

- proposals posted by people other than the seeder
- share of proposals reaching threshold; median hours from post to threshold
- responses by source, and in particular shared-link responses as a share of
  all responses (the virality number); and per sharer, how many responses
  their shares produced
- people on the roster who were not in the original CSV, and which proposal
  brought each
- forks created, and whether forked boards got their own posts
- posts in the four weeks after the trip
- "one more" texts sent and how many of those proposals reached threshold
  within 24 hours

### Stack

Boring and deployable in a day. Next.js App Router in `board/`, TypeScript,
Tailwind. Postgres on a hosted Supabase project used as a plain database (no
Supabase Auth; identity is ours), with SQL migrations like `web/`. Twilio for
SMS. `next/og` for the OG image route. Vercel for deploy and the daily cron.
Single repo, single app, seed script included. No Docker, no local database,
ever.

`board/` gets its **own** Supabase project (`board-dev`, plus `board-test` for
database tests) and its own Vercel project. It shares nothing with `web/`: no
database, no env vars, no migration history. Two things only the founder can
do before first deploy: create the Supabase projects, and set up Twilio.

**Twilio has lead time.** US long-code A2P messaging needs 10DLC
registration, which takes days to weeks; start it in October. A trial account
sends only to verified numbers. International SMS is priced and restricted
per country, and SMS while roaming in Vietnam is unreliable where WhatsApp on
wifi is not. See the open questions.

## Deliberately not

- No money movement. Cost is text.
- No comments, chat, reactions, or DMs. ON hands off to WhatsApp.
- No admin roles. The seeder is just the first poster. Anyone can post; only
  the poster can reopen or close their own proposal.
- No availability profile in v1 (see rejected).
- No editing a live proposal's minimum, day, or cost. Post a version instead.
  Title, detail line, place, links and notes can be edited by the poster at
  any time; nobody is texted about it.
- No push notifications, no app, no email.
- No integrations.
- No institution-facing anything. The campus engagement model is parked in
  `PIVOT.md` and `web/`; nothing here is built to feed it.

## First use and the test

**Phase 1, November to January: the cohort's ordinary life.** The board goes
into the WhatsApp group with the real asks already on it, posted by us:
the holiday party, the shirt order, and the trip add-ons as they come up. This
is where we learn whether anyone other than us posts, and whether thresholds
actually fire.

**Phase 2, the trip week in February:** dense, real, one proposal an hour.
Does the board survive a week where everything is decided on the fly?

**Phase 3, four weeks after:** does anyone post? That is the continuity
number.

`TEST.md` is written after the build: what we watch over one trip plus four
weeks, and the single interview question for each poster whose proposal went
ON: *"would this have happened without the board?"*

The seed script loads the trip five from the brief (suits in Hoi An, min 8,
~$250; overnight boat, min 10; street-food crawl, min 6; 5am side-city flight,
min 4; dinner in NYC the week we're back, min 6) so the demo and dev data are
real-shaped. The actual first posts on the live board are whatever the cohort
needs in November.

## Calls I made (check these while reading)

1. The app lives in `board/` in this repo; `web/` is untouched.
2. Names are visible to the roster; the unfurl shows a count only.
3. Maybe never counts toward the threshold.
4. A proposal's number, day, and cost are fixed after posting; versions are
   new proposals.
5. Conflict-aware yeses ship in v1; stated availability does not.
6. Postgres on hosted Supabase as a plain database, our own phone identity,
   Twilio for SMS.
7. The "one more" text fires at two short, once per proposal.
8. A forked board shares the person record (by phone) but nothing else with
   its parent.
9. New numbers answer with no verification; known numbers on a cookieless
   device get a one-time SMS code.
10. Names are visible on the page to anyone with the link; the unfurl shows
    the count only.
11. The poster counts as a yes. ON is a latch; it never reverts.
12. No deadline and no day means open forever; a day with no deadline is the
    deadline; deadlines are end-of-day in the board's timezone.
13. Digest goes only to people who have posted or answered; STOP is honored.
14. `board/` gets its own Supabase and Vercel projects.
15. No +1s in v1. A partner is on the roster with their own number, or the
    poster writes "partners welcome" in the detail line. (See open questions;
    this one is cheap to reverse.)

## Open questions (yours)

1. **How many of the sixty have non-US numbers?** If it's a handful, SMS is
   US-first and the rest get the board link only. If it's a third, the
   notification layer should be WhatsApp through Twilio from day one, which
   means template approval and a different build in step 4.
2. **Do yeses need a +1?** On a residency with partners, "I'm in, plus my
   wife" may be the first thing someone asks for. A +1 is a count on the yes
   that counts toward the minimum and shows as "Priya +1". It's a small
   change to every count on every card, so it's your rule, not mine. Default
   if you don't answer: no +1s in v1.

## Left to the builder

Visual design within the existing Loop design language (`SPEC.md` §4, raised
paper not ink borders, one meaning per surface, facts-only cards). Exact
copy of each text. Schema details. How the cookie and magic link are signed.
Rate limits on share minting and SMS. The OG image's layout.

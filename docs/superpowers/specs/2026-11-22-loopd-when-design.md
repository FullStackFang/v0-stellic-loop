# Loopd When: design

*2026-11-22. Status: approved by the founder to build ("ok sure that's fine i
want that"). Look approved in `/demo/mockups-when.html` ("love this"). Source:
the founder's "Loopd When (v1)" build prompt, changed by the decisions below.*

## Intent

A free tool, in the spirit of When2meet, that finishes the job: people paint the
hours they can make, the poll reminds them, tells the organizer when enough of
them overlap, and the organizer picks the time and sends a real invite in one
press. The same people can do it again next week in one tap. It is the first of
two free tools (When, then Where) meant to bring groups and club organizers
into Loopd, where Imprint is the paid step.

## Goals, non-goals, anti-goals

Goals
- Create a poll, share one link, answer on a phone.
- The organizer decides: Loopd says "it's ready", they pick the time, add a
  line, and send.
- Every answer belongs to a signed-in Loopd person with a verified email.
- "Ask the group again" makes next week's poll with the same people.
- Three numbers: open-to-answer rate, share of polls that reach their
  threshold, share of series with a second poll within 30 days.

Non-goals (v1): chat, comments, files, tasks, payments, venue suggestions,
sending texts, reading people's calendars, native apps, changes to existing
pages, turning a poll's people into a Loopd group (later), Where (next project).

Anti-goals
- A second login system or a second list of people beside Loopd's.
- Anything sent to the group that the organizer did not send.
- Two sets of invites for one poll.
- Loopd emailing an address its owner did not sign in with.
- A stub control: no Text pill that does nothing.

## Approaches

Who is answering
- **A. Loopd's existing sign-in (picked).** Email code or Google through Clerk.
  Answers attach to `person`. Verified, one identity across devices.
- B. Typed name and email, unchecked (the original prompt). Anyone can answer
  as anyone; the people stay outside Loopd.
- C. Our own emailed sign-in link. Same result as A, more to build.

Who settles the time
- A. The poll resolves itself and emails everyone (the original prompt).
  Rejected by the founder: "the organizer needs to pick and decide".
- **B. The organizer is told it is ready, picks, and sends (picked).**

How the invite goes out
- **Step 1: from Loopd**, through Resend, shown as "Maya via Loopd" with
  replies going to Maya. Works for every organizer.
- **Step 2: from the organizer's Google Calendar**, when they have connected
  Google: the event is made on their calendar with the answerers as guests and
  Google sends the invites from their own address. The founder asked for this.
- Not picked: sending as the organizer through Gmail itself (a wider
  permission for a worse invite), and a box for typing other people's emails.

## What changes from the original prompt

- Creating and answering need a Loopd sign-in. Reading a poll needs only the
  link. No school email is needed; the builder must check the school gate lets
  `/when` through.
- No `group` or `member` tables. A person is a Loopd `person`. A "group" is a
  **series**: the chain of polls made by "Ask the group again". Its people are
  everyone who answered any poll in it, plus the organizer.
- No Email/Text choice. Everyone has a verified sign-in email, read from Clerk
  when a message is sent (as club reach does); Loopd stores no copy.
- No browser token or private link: sign-in recognises a returning person.
- The poll never picks or sends by itself.
- The campus look, not the teal look.
- Work on `main` in small local commits, not a branch (standing rule).

## Screens

The approved mockup is `/demo/mockups-when.html`. Pages sit in `.cs` and reuse
`app/c/campus.css` classes: the school's bar and foot, a ticket (paper top,
tear, stub) at the head of each screen with seats that fill as people answer,
panels named by an ink tab, `cs-btn go` for the one action, the school's kit
for colour. Only the grid and the few new pieces get new CSS
(`app/when/when.css`).

- `/when/new`: the create form. Signed out, the action reads "Sign in to
  create the link" and returns to the filled form.
- `/when/[id]` open: ticket, grid, "Save my times". Signed out, the grid shows
  the counts and one action, "Sign in to add your times".
- `/when/[id]` open, for the organizer: the same, plus "The times that work
  best" (up to three, with who can make each, the best one chosen), "Add a
  line, if you like", and the send action. It can be used as soon as one
  person has answered; "ready" only decides when the organizer is emailed.
- `/when/[id]` sent: the ticket with the date tile and "It's on.", people list
  (you first, then in, then can't make it), "Add to my calendar"
  (`/when/[id]/calendar.ics`), "Update your answer". The organizer also sees a
  ready message with Send to WhatsApp and Copy, for people who never answered.
- `/when/[id]/again`: usual times, past sessions, "Ask the group again".
- "Next: where" and the streak panel render only when `WHEN_WHERE=on`.
- `/when/stats?key=`: three numbers, compared with `WHEN_STATS_SECRET`.

Grid: days across, hours down, cells at least 44px tall. Paint by pointer drag
(touch and mouse), by tap, and by keyboard (arrows move, space toggles). Others
show as a tint of the action colour by count; your picks carry an ink ring.

## Data (one migration, applied by the founder by hand)

- `when_poll`: id (12 random URL-safe characters), series_id (the first poll's
  id), previous_poll_id, organizer_id → person, title, start_date, end_date,
  hour_start, hour_end, timezone, expected_size, deadline, threshold
  (`majority` | `two_thirds` | `everyone`), status (`open` | `sent`), ready_at,
  ready_met (was the threshold met when it became ready), chosen_slot, note,
  sent_at, sent_via (`loopd` | `google`), google_event_id, created_at.
- `when_answer`: poll_id, person_id, slots timestamptz[], draft boolean,
  reminders_off boolean, stop_token, updated_at. Primary key (poll_id,
  person_id). A draft is a carried-over starting point and is never counted.
- `when_message`: id, poll_id, person_id, kind (`reminder_48` | `reminder_24`
  | `ready` | `deadline` | `invite`), state, attempts, sent_at, provider_id.
  Unique (poll_id, person_id, kind): one of each per person, whatever races.
- `when_event`: id, kind (`poll_opened`, `poll_created`, `response_saved`,
  `reminder_sent`, `poll_ready`, `poll_sent`, `repeat_created`), poll_id,
  series_id, visitor (a random first-party cookie value, for `poll_opened`
  only), at.

Row level security on, nothing granted to anon or authenticated, as elsewhere.

## Rules

- Slots are one hour, stored in UTC, drawn in the poll's timezone (the
  organizer's browser at creation). On a clocks-forward day the missing hour is
  not drawn; on a clocks-back day the repeated hour is drawn once.
- Size = the larger of expected_size and the number of people who answered. On
  a repeat poll expected_size is the series' people count.
- Needed: majority = floor(size/2)+1, two thirds = ceil(2·size/3), everyone =
  size.
- Ready: on a save, when at least three people have answered and some slot has
  the needed count; or when the deadline passes with at least one answer. It
  happens once (`ready_at` set where it was null) and queues one `ready`
  message to the organizer. If ready came before the deadline and nothing has
  been sent by the deadline, one `deadline` message follows. Then Loopd waits.
- Best slots: most people first; ties go to the earliest. The first is the
  one chosen for the organizer until they choose another.
- Sending is one transaction: lock the poll row, stop if it is not `open`, set
  chosen_slot, note, status `sent`, queue one `invite` per person who answered
  (in or not) and the organizer, write `poll_sent`. A second press finds it
  sent and does nothing.
- After sending, "Update your answer" changes the lists and never the time.
  Answers are still taken after the deadline until the poll is sent.
- Repeat: same title, hours, threshold and timezone; dates and deadline moved
  seven calendar days (by local date, so a clock change does not shift hours);
  each person's last answer copied seven days on as a draft.
- Reminders at 48 and 24 hours before the deadline go to series people who
  have not answered and have not stopped them. A first poll has no known
  people, so there the organizer is the only one Loopd can write to; the
  open page gives them a share message (WhatsApp, Copy) to nudge with.
- A person may create at most 10 polls a day.

## Email (step 1)

- Resend, called over HTTPS with `fetch` (no new package): the message id as
  the idempotency key, a five second timeout, `List-Unsubscribe` and
  `List-Unsubscribe-Post` pointing at `/api/when/stop/[stop_token]`, which
  stops emails about that poll in one step. One adapter in
  `lib/email/resend.ts`.
- `notify(person, message)` in `lib/when/notify.ts` is the only thing callers
  use; it writes the `when_message` row. The scheduled run sends, and a send
  the organizer just pressed is also drained at once, so it does not wait up
  to 15 minutes.
- The invite email: from "<organizer's name> via Loopd" at `WHEN_FROM`,
  Reply-To the organizer's address. It says the time, the organizer's line and
  who is in, has an "Add to my calendar" button, and carries a timed calendar
  invite built with the existing `memberInviteIcs`, both as a `text/calendar`
  part and attached as `invite.ics`.
- Sending happens only when `WHEN_SENDING=on` and `RESEND_API_KEY` is set;
  otherwise messages stay queued and a log line says what would have gone.
- Not in this change: wiring the same adapter into club reach's
  `emailSender()`.

## Google Calendar (step 2, after step 1 works)

- An organizer who signed in with Google can grant calendar access through
  Clerk (the `calendar.events` permission, added to the Google connection).
  The send screen then offers "Send from my Google Calendar" beside "Send from
  Loopd".
- Sending that way makes one event on the organizer's primary calendar: the
  chosen hour, the title, the note, the answerers who are in as guests, guests
  hidden from each other, Google told to email them. `google_event_id` is
  kept; `invite` messages are not queued for those guests. People who cannot
  make it still get Loopd's short result email.
- If Google refuses, nothing is marked sent and the organizer is offered
  "Send from Loopd".
- Before building: confirm Google's current review rules for this permission
  and how Clerk hands over the access token. Until Google approves the app it
  works only for listed test accounts.

## Scheduled run

`/api/cron/when`, every 15 minutes in `vercel.json`, guarded by `CRON_SECRET`
like the others: mark polls past their deadline ready, queue due reminders and
deadline nudges, send what is queued, stop well inside the time limit.

## Files

New: `app/when/**` (pages, actions, `when.css`, grid component),
`lib/when/{polls,slots,ready,send,notify,stats}.ts`, `lib/email/resend.ts`,
`app/api/cron/when/route.ts`, `app/api/when/stop/[token]/route.ts`, one
migration, tests beside each lib file, `WHEN.md`. Step 2 adds
`lib/when/google-calendar.ts`.
Touched: `vercel.json` (one cron line), the school gate only if it blocks
`/when`.

## Tests

Threshold maths; best slots and ties; slots across a clocks-forward and a
clocks-back week; repeat shifting across a clock change; ready happens once
(two concurrent saves, and a save racing the scheduled run); send twice sends
once; drafts never counted; stop link; stats from a known set of events.

## Founder steps

1. Resend: make the account, verify the sending domain, set `RESEND_API_KEY`
   and `WHEN_FROM` in Vercel; then `WHEN_SENDING=on`.
2. Set `WHEN_STATS_SECRET`.
3. Apply the migration.
4. Step 2: add the calendar permission to the Google connection in the Clerk
   dashboard and the Google Cloud project, list test accounts, submit for
   Google's review.

## Build order

1. Slot and threshold maths with tests.
2. Migration, create and answer, the grid.
3. Ready, the organizer's pick and send, result page, calendar file.
4. Email, reminders, stop link, the scheduled run.
5. Repeat.
6. Events, stats page, `WHEN.md`.
7. Google Calendar send.

## Left to the builder

Where a first-time person's name comes from if the account has none; the exact
shade steps of the tint; copy for the edge cases (no answers at the deadline,
threshold not met); how the visitor cookie is set.

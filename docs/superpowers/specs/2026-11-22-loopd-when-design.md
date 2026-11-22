# Loopd When: design

*2026-11-22. Status: look approved by the founder ("love this", /demo/mockups-when.html, round two); waiting for his go-ahead to build. Source: the founder's
"Loopd When (v1)" build prompt, changed by the decisions below.*

## Intent

A free tool, in the spirit of When2meet, that finishes the job: people paint the
hours they can make, the poll reminds them, picks the time once enough of them
overlap, tells everyone with a calendar file, and lets the same people do it
again in one tap. It is the first of two free tools (When, then Where) meant to
bring groups and club organizers into Loopd, where Imprint is the paid step.

## Goals, non-goals, anti-goals

Goals
- Create a poll, share one link, answer on a phone, and have it resolve itself.
- Every answer belongs to a signed-in Loopd person with a verified email.
- "Ask the group again" makes next week's poll with the same people.
- Three numbers: open-to-answer rate, share of polls that meet their threshold,
  share of series with a second poll within 30 days.

Non-goals (v1): chat, comments, files, tasks, payments, venue suggestions,
sending texts, reading people's calendars, native apps, changes to existing
pages, turning a poll's people into a Loopd group (later), Where (next project).

Anti-goals
- A second login system or a second list of people beside Loopd's.
- Two sets of result emails for one poll.
- A stub control: no Text pill that does nothing.

## Approaches to "who is answering"

- **A. Loopd's existing sign-in (picked).** Email code or Google through Clerk,
  which sends the code itself. Answers attach to `person`. Verified, one
  identity across devices, and a poll's people can later become a group. Cost:
  one sign-in before a first answer.
- B. Typed name and email, unchecked (the original prompt). Fastest first
  answer; anyone can answer as anyone, a second device is a second person, and
  the people stay outside Loopd.
- C. Our own emailed sign-in link. Same result as A, more to build and keep.

The founder asked for "some sort of cheap or simple login (via email)" that
records the response, and Resend for email. A is my reading of that.

## What changes from the original prompt

- Creating and answering need a Loopd sign-in. Reading a poll (title, grid of
  how many are free, result) needs only the link. No school email is needed;
  the builder must check the school gate lets `/when` through.
- No `group` or `member` tables. A person is a Loopd `person`. A "group" is a
  **series**: the chain of polls made by "Ask the group again". Its people are
  everyone who answered any poll in it, plus the organizer.
- No Email/Text choice. Everyone has a verified sign-in email, read from Clerk
  when a message is sent (as club reach does); Loopd stores no copy. Texts come
  back when there is a text provider.
- No browser token or private link: sign-in recognises a returning person.
- Work on `main` in small local commits, not a branch (standing rule).
- A mockup of the four screens is approved before any screen is built
  (standing rule).

## Screens

In the look of the campus pages, not the teal look the prompt describes
(founder, 2026-11-22: "this isn't using the style of the rest of the app, and I
would like it to"). The approved mockup is `/demo/mockups-when.html`: the
school's bar and foot, a ticket (paper top, tear, stub) at the head of each
screen with seats that fill as people answer, panels named by an ink tab,
`cs-btn go` for the one action, the school's kit for colour. Pages sit in
`.cs` and reuse `app/c/campus.css` classes; only the grid and the few new
pieces get new CSS (`app/when/when.css`).

- `/when/new`: the create form. Signed out, the lime button reads "Sign in to
  create the link" and returns to the filled form.
- `/when/[id]` open: plate, grid, "Save my times". Signed out, the grid shows
  the counts and one lime "Sign in to add your times".
- `/when/[id]` resolved: the ticket with the date tile and "It's on.", people
  list, "Add to my calendar" (`/when/[id]/calendar.ics`), "Update your answer".
  The organizer also sees "Sent by itself" (how many people got the email) and
  "Tell anyone who did not answer": a ready message with Send to WhatsApp and
  Copy. No box for typing other people's email addresses in v1.
- `/when/[id]/again`: usual times, past sessions, "Ask the group again".
- "Next: where" and the streak panel render only when `WHEN_WHERE=on`.
- `/when/stats?key=`: three numbers, compared with `WHEN_STATS_SECRET`.

Grid: days across, hours down, cells at least 44px tall. Paint by pointer drag
(touch and mouse), by tap, and by keyboard (arrows move, space toggles). Others
show as a blue tint by count; your picks carry a navy inner ring.

## Data (one migration, applied by the founder by hand)

- `when_poll`: id (12 random URL-safe characters), series_id (the first poll's
  id), previous_poll_id, organizer_id → person, title, start_date, end_date,
  hour_start, hour_end, timezone, expected_size, deadline, threshold
  (`majority` | `two_thirds` | `everyone`), status (`open` | `resolved`),
  resolved_slot, resolved_met (was the threshold met), created_at.
- `when_answer`: poll_id, person_id, slots timestamptz[], draft boolean,
  reminders_off boolean, stop_token, updated_at. Primary key (poll_id,
  person_id). A draft is a carried-over starting point and is never counted.
- `when_message`: id, poll_id, person_id, kind (`reminder_48` | `reminder_24`
  | `result`), state, attempts, sent_at, provider_id. Unique (poll_id,
  person_id, kind): this is what makes resolving twice send once.
- `when_event`: id, kind (`poll_opened`, `poll_created`, `response_saved`,
  `reminder_sent`, `poll_resolved`, `repeat_created`), poll_id, series_id,
  visitor (a random first-party cookie value, for `poll_opened` only), at.

Row level security on, nothing granted to anon or authenticated, as elsewhere.

## Rules

- Slots are one hour, stored in UTC, drawn in the poll's timezone (the
  organizer's browser at creation). On a clocks-forward day the missing hour is
  not drawn; on a clocks-back day the repeated hour is drawn once.
- Size = the larger of expected_size and the number of people who answered. On
  a repeat poll expected_size is the series' people count.
- Needed: majority = floor(size/2)+1, two thirds = ceil(2·size/3), everyone =
  size.
- Early resolve: on a save, if at least three people have answered and some
  slot has the needed count. At the deadline it resolves regardless; if nothing
  meets the threshold it takes the best slot and the result says so plainly. A
  poll with no answers at its deadline resolves with no slot and sends nothing.
- Best slot: most people; ties go to the earliest.
- Resolving is one transaction: lock the poll row, stop if it is not `open`,
  set the result, insert one `result` message per person in the series, write
  `poll_resolved`. A second caller finds it resolved and does nothing.
- After resolving, "Update your answer" changes the lists and never the slot.
- Repeat: same title, hours, threshold and timezone; dates and deadline moved
  seven calendar days (by local date, so a clock change does not shift hours);
  each person's last answer copied seven days on as a draft.
- Reminders at 48 and 24 hours before the deadline go to series people who
  have not answered and have not stopped them. **A first poll has no known
  people**, so its reminder goes to the organizer instead: "3 of 7 have
  answered", with the link to forward. (The original prompt did not cover
  this.)
- A person may create at most 10 polls a day.

## Email

- Resend, called over HTTPS with `fetch` (no new package): the message id as
  the idempotency key, a five second timeout, `List-Unsubscribe` and
  `List-Unsubscribe-Post` pointing at `/api/when/stop/[stop_token]`, which
  stops reminders for that poll in one step. One adapter in
  `lib/email/resend.ts`.
- `notify(person, message)` in `lib/when/notify.ts` is the only thing callers
  use; it writes the `when_message` row. The scheduled run sends.
- The result email goes by itself, the moment the poll resolves, to everyone
  who answered (in or not) and the organizer. It says the time, who is in, and
  has an "Add to my calendar" button. It carries a timed calendar invite built
  with the existing `memberInviteIcs`, both as a `text/calendar` part (so mail
  apps show it as an invite) and attached as `invite.ics`. Loopd never emails
  an address its owner did not sign in with.
- Sending happens only when `WHEN_SENDING=on` and `RESEND_API_KEY` is set;
  otherwise messages stay queued and a log line says what would have gone.
- Not in this change: wiring the same adapter into club reach's
  `emailSender()`. It is a two line follow-up once the founder wants reach on.

## Scheduled run

`/api/cron/when`, every 15 minutes in `vercel.json`, guarded by `CRON_SECRET`
like the others: resolve polls past their deadline, queue due reminders, send
what is queued, stop well inside the time limit.

## Files

New: `app/when/**` (pages, actions, `when.css`, grid component),
`lib/when/{polls,slots,resolve,notify,stats}.ts`, `lib/email/resend.ts`,
`app/api/cron/when/route.ts`, `app/api/when/stop/[token]/route.ts`, one
migration, tests beside each lib file, `WHEN.md`.
Touched: `vercel.json` (one cron line), the school gate only if it blocks
`/when`.

## Tests

Threshold maths; best slot and ties; slots across a clocks-forward and a
clocks-back week; repeat shifting across a clock change; resolve twice sends
once (two concurrent saves, and save racing the scheduled run); drafts never
counted; stop link; stats from a known set of events.

## Founder steps

1. Approve the mockup (`/demo/mockups-when.html`).
2. Resend: make the account, verify the sending domain, set `RESEND_API_KEY`
   and `WHEN_FROM` in Vercel; then `WHEN_SENDING=on`.
3. Set `WHEN_STATS_SECRET`.
4. Apply the migration.

## Build order

1. Mockup of the four screens; stop for approval.
2. Slot and threshold maths with tests.
3. Migration, create and answer, the grid.
4. Resolve, result page, calendar file.
5. Email, reminders, stop link, the scheduled run.
6. Repeat.
7. Events, stats page, `WHEN.md`.

## Left to the builder

Where a first-time person's name comes from if the account has none; the exact
shade steps of the tint; copy for the edge cases (no answers at deadline,
threshold not met); how the visitor cookie is set.

# Loopd When

Find a time that works for a group. One person makes a poll and passes on its link. Everyone paints the hours they can
make. When enough can make one hour, or the deadline passes, Loopd tells the person who asked. They pick the time, add a
line, and press send. Everyone who answered gets an email with a calendar invite.

Design: `docs/superpowers/specs/2026-11-22-loopd-when-design.md`. Approved look: `public/demo/mockups-when.html`, and `public/demo/mockups-when-days.html` for the calendar, the sets of days and the laptop layout.

## Rules worth knowing

- The one who asked picks the days on one calendar, and whether weekends are in the poll. "Answer by" is a day; the poll closes when that day ends on their clock.
- The grid shows five days at a time on a phone and seven on a laptop, the first days first. Each set says its best count, and the three best times carry a 1, 2 or 3. The stub of the ticket says who can make a time: the best so far, then whichever time was last touched. On a phone the screen fits without scrolling and Save stays at its foot (`public/demo/mockups-when-fit.html`, 3).
- People paint whole hours. When the organizer picks an hour they may start it at :00, :15, :30 or :45 and say how long it runs (30 minutes to 2 hours). Who is "in" is who painted that hour.
- Nothing is sent to the group until the organizer presses send. Send happens once.
- Anyone with the link can see a poll and answer it. Nobody needs an account: someone not signed in types a name beside Save (`public/demo/mockups-when-name.html`), is drawn as their initial, and is found again by a mark kept in their browser (`lib/when/guests.ts`, table `when_guest`). Someone signed in answers as themselves, with their animal. "Have Loopd? Sign in" signs a visitor in on the poll itself (`/when/<id>?in=1`: its ticket beside the sign-in card) and lands them back on it; answers they gave under a name on that browser become their account's. A poll takes at most 200 answers.
- Loopd emails an address its owner signed in with, read from the sign-in provider when a message is sent and not stored. One exception: a guest may type an address after saving, kept on that answer (`when_answer.invite_email`) and used for that poll's invite only, never for reminders or another poll.
- A first poll reminds nobody, because nobody is known yet. Reminders (48 and 24 hours before the deadline) go to the people of a series, from its second poll on.
- "Ask the group again" makes next week's poll in the same series, with each person's usual times filled in as a draft. A draft counts only once that person saves.
- Every email has a link that stops emails about that poll for that person.
- Mail that waits more than three days, or an invite for an hour that has passed, is closed unsent. Turning sending on late does not release old mail.

## Routes

| Route | What it is |
| --- | --- |
| `/when/new` | Make a poll |
| `/when/[id]` | Answer; for the organizer, pick the time and send; the result once sent. `?edit=1` shows the grid, `?pick=1` lets the organizer pick early |
| `/when/[id]/again` | Ask the same group again (people of the series only) |
| `/when/[id]/calendar.ics` | The set time as a calendar file |
| `/when/stats?key=...` | The three numbers; not found without the key |
| `/api/when/stop/[token]` | The stop link in every email |
| `/api/cron/when` | The scheduled run, every 15 minutes (`vercel.json`) |

## Code

- `lib/when/slots.ts`: hours of a poll, thresholds, readiness, clock changes.
- `lib/when/polls.ts`: make, answer, read. `lib/when/send.ts`: pick and send, the calendar file, the words to pass on.
- `lib/when/outbox.ts`: the scheduled run. `lib/when/emails.ts`: the words of each email. `lib/email/resend.ts`: the provider.
- `lib/when/repeat.ts`: the series and the next poll. `lib/when/stats.ts`: the numbers.
- `app/when/**`: the pages, all in the campus look, classes starting `wn-` in `app/when/when.css`.

## Tables

`supabase/migrations/20261122000000_when.sql` and `20261122010000_when_days.sql`: `when_poll`, `when_answer`, `when_message` (the outbox, one row per
poll, person and kind, so nothing is sent twice), `when_event` (what the numbers are counted from).

## Settings

| Variable | For |
| --- | --- |
| `RESEND_API_KEY` | The email provider. Without it nothing is sent and nothing is marked failed |
| `WHEN_FROM` | The address emails come from, on a domain verified with Resend, for example `when@your-domain` |
| `WHEN_SENDING` | `on` to send. Anything else: messages queue and wait |
| `WHEN_STATS_SECRET` | The key for `/when/stats` |
| `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` | Already set for the rest of the app; the scheduled run and every link in an email need them |

## Run the scheduled job by hand

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/when
```

It answers with what it did: polls made ready, messages queued, sent, failed, and waiting to be tried again.

## Not built yet

- Sending from the organizer's own Google Calendar (step 2 of the design). It has its own plan.
- "Next: where" and the streak panel (`WHEN_WHERE` in the design).
- The poll says how long the meeting runs (an hour unless said), set on the create form and changeable when the time is picked.
- The organizer can edit an open poll at `/when/<id>/change` (the create form, filled in). The link and the poll's clock stay the same; hours people painted that the new plan no longer has are dropped, the rest kept. Once the time is set the poll does not change.
- `/when` lists the polls a person made or has an answer in, open ones first, each with its state as a pill.

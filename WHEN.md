# Loopd When

Find a time that works for a group. One person makes a poll and passes on its link. Everyone paints the hours they can
make. When enough can make one hour, or the deadline passes, Loopd tells the person who asked. They pick the time, add a
line, and press send. Everyone who answered gets an email with a calendar invite.

Design: `docs/superpowers/specs/2026-11-22-loopd-when-design.md`. Approved look: `public/demo/mockups-when.html`.

## Rules worth knowing

- Nothing is sent to the group until the organizer presses send. Send happens once.
- Anyone with the link can see a poll. Answering needs a Loopd sign-in.
- Loopd only emails an address its owner signed in with. Addresses are read from the sign-in provider when a message is sent and are not stored.
- A first poll reminds nobody, because nobody is known yet. Reminders (48 and 24 hours before the deadline) go to the people of a series, from its second poll on.
- "Ask the group again" makes next week's poll in the same series, with each person's usual times filled in as a draft. A draft counts only once that person saves.
- Every email has a link that stops emails about that poll for that person.

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

`supabase/migrations/20261122000000_when.sql`: `when_poll`, `when_answer`, `when_message` (the outbox, one row per
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

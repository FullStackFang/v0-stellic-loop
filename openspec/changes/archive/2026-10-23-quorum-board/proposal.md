# Proposal

## Why

The cohort (about sixty people, one WhatsApp group, a one-week residency Feb 14–20 2027) plans everything by chatter and nothing becomes countable: posting makes you the owner, a yes to a half-formed plan is a commitment, and polls have no threshold and kick nothing off. `DESIGN.md` (2026-10-21) describes a shared-intent board that fixes this, and `quorum.html` v5 is the approved look. Nothing of it is built, and the board needs to be in the WhatsApp group by November so three phases can be observed: ordinary cohort life, the trip week, and the four weeks after.

## What Changes

This change is **slice 1** of the board: the part that is usable by the cohort with no texts at all. Later slices (SMS, fork and versions, digest, stats page, seed script) are separate changes that build on this one.

- The repo root becomes the deployable app (Next.js App Router, TypeScript, Tailwind, hosted Supabase Postgres used as a plain database with SQL migrations, Vercel with a daily cron). `web/` and `openspec/changes/loop-mvp` are untouched; the static demos move to `public/demo/` (served at `/demo/…`) and stay as the design reference.
- **Identity by phone number and name.** No accounts, no passwords, no Supabase Auth. A long-lived signed cookie is the session. A number nobody has seen answers with no round trip; a known number on a cookieless device gets a one-time SMS code (stubbed to a logged code until Twilio exists). Magic-link tokens in texts set the same cookie.
- **Posting an intent.** Title and a "needs a day" switch (default on); behind a fold, all optional: one line, rough cost as text, time, a number, links. The poster is in. Title is fixed after posting; detail line, place, links, notes are editable by the poster; anyone in can add a link, a place, a note, attributed to them.
- **Responding.** In / out / maybe, one tap, changeable any time. Maybe never counts toward the number. Each person can switch their name off and still count ("+1 anonymous"). No +1s in v1.
- **Your days.** Each person marks free days for the board's window on their own page (manual strip; calendar connection is not in this slice). Tapping in attaches those days to the intent; adjustable per intent. A day you are already ON for elsewhere is removed automatically and the card says so. Day heat per intent shows counts, never who.
- **Quorum prompt and lock.** When enough people overlap on one day (the poster's number, or 4) the intent shows "6 of 9 can do Tue 16. Lock it in?"; intents that need no day prompt at the same count of yeses. Anyone in can lock. ON is a latch. Locking writes the `threshold_reached` event once, hands the notifier the ON message (a logging notifier in this slice), and exposes an `.ics` for anything ON with a day.
- **Idle, past, close, reopen.** No deadline and no day means open forever; a day with no deadline is the deadline; deadlines are end-of-day in the board's timezone. Idling is computed at read time and written by the daily cron; no text on idle, ever. The poster can close, or reopen at a lower number (M8).
- **The board.** One stable, token-free link per group (pinnable): open intents nearest-to-the-ask first, then ON, then past and idled. The v5 look: hero with live stats, hairline cards with date blocks, Delta plates, ghost actions, the ask.
- **Share and unfurl.** Every share mints `/p/<id>?s=<token>` recording who and when; the OG image is rendered per response count with `Cache-Control: no-store`; `rel=canonical` points to the bare URL. The unfurl shows the count only; the page shows names to anyone holding the link.
- **Event log.** Every state change is a row with timestamp, person, intent, board and source (`group_link`, `proposal_link` with share token and sharer, `fork`, `seed`, and the text sources reserved for slice 2). Stats page is a later slice; the rows exist from day one.
- **Notifier interface.** One `Notifier` with `onReached`, `oneMore`, `maybeNudge`, `dropped`, `code`, `magicLink` methods and a `LogNotifier` implementation. Twilio implementation is slice 2 (US SMS first; WhatsApp through Twilio deferred until the non-US count is known).

## Capabilities

### New Capabilities
- `board-identity`: person = phone + name; signed cookie session; no-friction first answer for unknown numbers; one-time code for known numbers on cookieless devices; magic-link tokens; name visibility switch; STOP flag.
- `intent-posting`: the post form, defaults, what is fixed vs editable, additive shared details with attribution, "post a version" prefill.
- `intent-response`: in / out / maybe semantics, change at any time, maybe never counts, "+1 anonymous", the poster counts as a yes.
- `free-days`: per-person free days for a board window, attachment on tap-in, per-intent adjustment, automatic conflict removal, day heat as counts only.
- `quorum-and-lock`: quorum computation (day overlap or plain count), the prompt, who may lock, ON as a latch, deadlines and idling, past and closed, reopen at a lower number, `.ics` for ON with a day, the notifier hand-off.
- `board-page`: one stable link per board, sort order, sections, what each card shows (facts only), the hero stats.
- `share-unfurl`: per-share tokens, OG image per response count, cache headers, canonical, roster growth from a shared link.
- `event-log`: the event rows, their sources, and which action writes which event exactly once.

### Modified Capabilities
<!-- none: the loop-mvp specs describe a different product and are not touched -->

## Impact

- The repo root becomes the app: `package.json`, Supabase migrations, Vitest tests and SQL tests, `vercel.json` cron, README.
- New hosted Supabase projects `board-dev` and `board-test`, and a new Vercel project; nothing shared with `web/` (founder tasks, like `loop-mvp` 1.4).
- Twilio 10DLC registration should start now; it is not needed to ship this slice.
- `quorum.html` v5 CSS is ported into `app/globals.css` as the token and component source; the static demo is otherwise untouched.
- Dependencies: `next`, `react`, `@supabase/supabase-js` (service role only, server side), `@vercel/og` via `next/og`, `ics` generation in-house, `jose` or Node crypto for signing.

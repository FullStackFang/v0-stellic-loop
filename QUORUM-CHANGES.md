# Quorum: what changed, Oct 21–28 2026

*A short summary for review. Sources: git log `aa153f9..074eec3`, `DESIGN.md`,
and the OpenSpec changes in `openspec/changes/` (archive `2026-10-23-quorum-board`,
`2026-10-24-quorum-boards`, and the open `quorum-board-sms`).*

## The pivot, in one line

Loop stopped being a campus engagement tool and became **Quorum**, a board
with thresholds for one bounded group. The first group is the founder's EMBA cohort
(about 60 people, one WhatsApp group, a trip to Hoi An Feb 14–20 2027).
Anyone posts an intent. Others tap **in / out / maybe**. When enough people
can make the same day, anyone who is in can **lock** it, and it goes **ON**. Plans that don't
reach the number just **idle**, with no failure state and no chasing.
Rationale: `DESIGN.md` ("Why this, why now").

## What shipped, in order

| Date | Change | What it means |
|---|---|---|
| Oct 21 | Design + mockups (`DESIGN.md`, `public/demo/quorum.html` v1→v5) | The mechanic, then a visual direction picked through rounds of clickable mockups. v5 is final: Source Serif 4 + Geist, hairline cards, date blocks, ghost buttons, the "Dusk twist" hero. No emoji. |
| Oct 23 | **Slice 1: the real app** (`7a26f1d`) | Next.js 16 app at the repo root. The old static demos moved to `/demo/*`. Postgres on hosted Supabase through server-side `pg` only (RLS on, no grants, so the public key reads nothing). |
| Oct 24 | **Boards anyone can start** (`98dbc56`) | Rolling two-week windows, "Start a board" on `/`, "Copy names" on each intent. |
| Oct 25 | **SMS slice, first cut** (`2603336`, `f5af821`) | A Twilio notifier for codes, ON, drop and one-more texts. Short `/m/` sign-in links. A consent line plus `/privacy` and `/terms` for 10DLC. |
| Oct 26 | **SMS revised: codes only** (`aacf9ea`) | Only sign-in codes are texted, through Twilio Verify. Plan texts are logged, not sent. Every new number must confirm a code. |
| Oct 26 | Phone frame on desktop (`074eec3`) | On laptops the app sits inside a phone shell. CSS only; phones are unchanged. |

## How it works now (the parts worth checking)

**Identity.** A person is a phone number plus a name. There are no accounts and no passwords.
A long-lived signed cookie is the session. *Changed Oct 26:* an unknown number
becomes a person only after its code checks. Before that, a new number got in
with no code. Single-use magic-link tokens set the same cookie.

**Posting and responding.** The only required fields are a title and "needs a day" (on by default). Cost,
time, minimum, place and links are optional. The poster counts as in. Maybe never
counts. Anyone can hide their name and still count ("+1 anonymous").

**Free days and quorum.** Each person marks their free days for the board's
window once. Tapping in attaches those days. Day heat shows counts, never names.
When enough people overlap on one day (the poster's number, or 4 by default), the card
asks "6 of 9 can do Tue 16. Lock it in?" Locking runs in a single SQL
function (`lock_proposal`). ON is a latch, the `threshold_reached` event is written
once, and an `.ics` is offered.

**Board windows.** A board's window is either *fixed* (the trip: Feb 14–20) or *rolling* (today plus 13
days, in the board's timezone). On a rolling board, an intent that needs a day gets an
implied deadline 13 days after it's posted. Reopening moves that deadline to the end of the current window. Days in the past
never count.

**Starting a board.** Every board started from `/` is rolling and ownerless, with a readable
slug, noindex, and rate limits per number and per IP. Fixed boards such as the trip are
still created by hand in SQL.

**Sharing.** Each share mints `/p/<id>?s=<token>` (who shared it, and when). The OG image shows the
live count with `no-store`. The unfurl shows only the count; the page shows names.

**Event log.** Every state change is a row with its source (`group_link`,
`proposal_link`, …). There is no stats page yet, but the data is collected from day one.

**Database.** Migrations `0001`–`0007` cover the schema, the lock, grants, a pinned
`search_path`, rolling boards, and SMS events. Every migration is additive for the
live `emba27` board.

## Not yet live / open items

- **Twilio Verify isn't switched on.** The founder still has to create the Verify service
  and set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID`
  in Vercel Production (tasks 1.1 and 1.3 in `quorum-board-sms`). Without those variables, codes are
  only logged. With the new "every number confirms a code" rule, that means **new
  people can't sign up on the live site until those variables are set**.
- Plan texts (ON, drop, one more, maybe nudge) are written and tested but not sent.
- Not in git yet: a new `DESIGN.md` section, "Three uses, and places". It covers the trip,
  a team room, and a club president's interest list. It plans a stored *place* behind
  each location, place events, a booking link at lock, and later, vendor pages
  that businesses can claim (mockup `public/demo/mockups-vendor.html`, plus a new
  `mockups-post.html`).

## Questions for the reviewer

1. **Codes for everyone.** Every new number now has to confirm a code. That adds friction exactly
   where the WhatsApp link drops people in. Is the trust gain worth it for a
   60-person group that already knows each other?
2. **Anyone in can lock.** Is that the right authority with no owner, or does
   it invite early or contested locks?
3. **Implied 13-day deadline** on rolling boards. Is it intuitive, or should a rolling
   intent with no day idle some other way?
4. **Names visible to anyone with the link**, while the unfurl shows only counts. Is that
   acceptable outside the cohort, for example on club boards?
5. **Places → vendor pages.** Should place data be collected in the MVP
   ahead of a vendor product that may never ship?
6. **US numbers only.** That works for the cohort now, but it rules out texting abroad during the
   trip week.

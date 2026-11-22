# Loopd When Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free availability poll at `/when` where people paint the hours they can make, the organizer is told when enough overlap, picks the time and sends the invite from Loopd.

**Architecture:** Pure slot and threshold maths in `lib/when/slots.ts`; services in `lib/when/*` that take `Db` and a `Principal` like the rest of `lib/emba`; four `when_*` tables hanging off `person`; an outbox table drained by one Vercel cron and by the send action; pages under `app/when` inside the campus frame.

**Tech Stack:** Next.js 16.4 App Router (read `node_modules/next/dist/docs/` first, per `AGENTS.md`), React 19, Postgres through `lib/db`, Clerk through `lib/emba/portal-session`, zod 4, vitest 5 with PGlite (`test/db.ts`), Resend over `fetch`.

**Spec:** `docs/superpowers/specs/2026-11-22-loopd-when-design.md`. Look: `public/demo/mockups-when.html`.

**Not in this plan:** step 2 of the spec, sending from the organizer's Google Calendar. It gets its own plan once this one works and Google's review rules are confirmed.

## Global Constraints

- No new npm packages. No UI library. No changes to existing pages beyond the three touches named in Task 5 and Task 4.
- Work on `main`; small local commits; never push. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Run only the tests of the files changed: `npx vitest run <file> 2> "<scratchpad>/when-test.log"`. Never a whole folder. No log files in the repo.
- No `next build` until the last task, once, with no dev server building at the same time. `npx tsc --noEmit` when types change.
- The migration is applied by the founder by hand: paste its SQL in the final reply. No Docker, no local Supabase.
- Copy: sentence case, plain words, no emoji, no em dashes, never "fold in".
- Every clickable control is a filled or outlined pill. No bare heading, label or hint on a panel: each sits in a tab or pill. No scroll bars, no scrolling inside a card.
- Pages sit in `.cs` and reuse `app/c/campus.css` classes exactly as the mockup does; new CSS only in `app/when/when.css`, every class prefixed `wn-`.
- Times: stored as `timestamptz`, exchanged as ISO strings ending in `Z`, drawn in the poll's IANA timezone.
- Threshold values are `majority`, `two_thirds`, `everyone`. Poll status values are `open`, `sent`.

## Review Focus

1. The organizer presses send twice, or in two tabs: one set of invites (Task 3).
2. An answer names a time the poll does not have, or a time twice: refused, nothing stored (Task 2).
3. A poll address that is malformed or unknown: the not-found page, never an error (Task 5).
4. A browser sends a timezone Postgres or `Intl` does not know: creating is refused with a plain message (Task 2).
5. One person has no verified email when the invites go: theirs is marked failed, everyone else's still goes (Task 4).

---

### Task 1: Slots and thresholds

**Files:**
- Create: `lib/when/slots.ts`
- Test: `lib/when/slots.test.ts`

**Interfaces:**
- Produces:
  - `type Threshold = 'majority' | 'two_thirds' | 'everyone'`
  - `type Frame = { startDate: string; endDate: string; hourStart: number; hourEnd: number; timezone: string }` (dates `YYYY-MM-DD`; `hourEnd` exclusive, 1 to 24)
  - `type Slot = { day: string; hour: number; at: string }`
  - `validZone(tz: string): boolean`
  - `slotsOf(frame: Frame): Slot[]` in day then hour order
  - `needed(threshold: Threshold, size: number): number`
  - `sizeOf(expected: number, answered: number): number`
  - `bestSlots(answers: { personId: string; slots: string[] }[], limit?: number): { at: string; people: string[] }[]` (default limit 3; slots nobody picked are left out)
  - `readiness(i: { threshold: Threshold; expectedSize: number; answers: { personId: string; slots: string[] }[]; deadline: Date; now: Date }): { ready: boolean; met: boolean }`
  - `shiftWeek(at: string, tz: string): string`
  - `slotLabel(at: string, tz: string): { day: string; dow: string; dowLong: string; date: number; month: string; time: string }` (`time` like `7 pm`, `dow` like `Tue`, `month` like `Dec`)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { bestSlots, needed, readiness, shiftWeek, sizeOf, slotLabel, slotsOf, validZone } from './slots';

const NY = 'America/New_York';
describe('needed', () => {
  it.each([['majority', 7, 4], ['majority', 4, 3], ['two_thirds', 7, 5], ['two_thirds', 6, 4], ['everyone', 7, 7], ['majority', 1, 1]] as const)('%s of %i is %i', (t, n, want) => expect(needed(t, n)).toBe(want));
});
it('size is the larger of expected and answered', () => { expect(sizeOf(7, 4)).toBe(7); expect(sizeOf(3, 5)).toBe(5); });
describe('slotsOf', () => {
  it('draws each hour of each day in the poll zone', () => {
    const s = slotsOf({ startDate: '2026-11-30', endDate: '2026-12-01', hourStart: 17, hourEnd: 19, timezone: NY });
    expect(s.map(x => x.at)).toEqual(['2026-11-30T22:00:00.000Z', '2026-11-30T23:00:00.000Z', '2026-12-01T22:00:00.000Z', '2026-12-01T23:00:00.000Z']);
    expect(s[0]).toMatchObject({ day: '2026-11-30', hour: 17 });
  });
  it('leaves out the hour that does not exist when clocks go forward', () => {
    const s = slotsOf({ startDate: '2027-03-14', endDate: '2027-03-14', hourStart: 1, hourEnd: 4, timezone: NY });
    expect(s.map(x => [x.hour, x.at])).toEqual([[1, '2027-03-14T06:00:00.000Z'], [3, '2027-03-14T07:00:00.000Z']]);
  });
  it('draws the repeated hour once when clocks go back', () => {
    const s = slotsOf({ startDate: '2026-11-01', endDate: '2026-11-01', hourStart: 0, hourEnd: 3, timezone: NY });
    expect(s.map(x => [x.hour, x.at])).toEqual([[0, '2026-11-01T04:00:00.000Z'], [1, '2026-11-01T05:00:00.000Z'], [2, '2026-11-01T07:00:00.000Z']]);
  });
});
describe('bestSlots', () => {
  const a = '2026-12-01T23:00:00.000Z', b = '2026-12-02T00:00:00.000Z', c = '2026-12-03T00:00:00.000Z';
  const answers = [{ personId: 'p1', slots: [a, b] }, { personId: 'p2', slots: [b, c] }, { personId: 'p3', slots: [c, b] }, { personId: 'p4', slots: [] }];
  it('orders by people, ties to the earliest', () => expect(bestSlots(answers).map(x => [x.at, x.people.length])).toEqual([[b, 3], [c, 2], [a, 1]]));
  it('keeps to the limit and names the people', () => expect(bestSlots(answers, 1)).toEqual([{ at: b, people: ['p1', 'p2', 'p3'] }]));
  it('is empty when nobody picked anything', () => expect(bestSlots([{ personId: 'p4', slots: [] }])).toEqual([]));
});
describe('readiness', () => {
  const at = '2026-12-01T23:00:00.000Z', deadline = new Date('2026-11-27T23:00:00Z'), before = new Date('2026-11-25T00:00:00Z'), after = new Date('2026-11-28T00:00:00Z');
  const three = ['p1', 'p2', 'p3'].map(personId => ({ personId, slots: [at] }));
  it('is ready early when three answered and the threshold is met', () => expect(readiness({ threshold: 'majority', expectedSize: 4, answers: three, deadline, now: before })).toEqual({ ready: true, met: true }));
  it('is never ready early with two answers', () => expect(readiness({ threshold: 'majority', expectedSize: 2, answers: three.slice(0, 2), deadline, now: before })).toEqual({ ready: false, met: true }));
  it('waits when the threshold is not met', () => expect(readiness({ threshold: 'everyone', expectedSize: 7, answers: three, deadline, now: before })).toEqual({ ready: false, met: false }));
  it('is ready at the deadline with one answer, met or not', () => expect(readiness({ threshold: 'everyone', expectedSize: 7, answers: three.slice(0, 1), deadline, now: after })).toEqual({ ready: true, met: false }));
  it('is not ready at the deadline with no answers', () => expect(readiness({ threshold: 'majority', expectedSize: 7, answers: [], deadline, now: after })).toEqual({ ready: false, met: false }));
});
it('moves a time seven days on by the local clock, across a clock change', () => expect(shiftWeek('2027-03-09T00:00:00.000Z', NY)).toBe('2027-03-15T23:00:00.000Z'));
it('labels a time in the poll zone', () => expect(slotLabel('2026-12-02T00:00:00.000Z', NY)).toEqual({ day: '2026-12-01', dow: 'Tue', dowLong: 'Tuesday', date: 1, month: 'Dec', time: '7 pm' }));
it('knows a real zone from a made-up one', () => { expect(validZone(NY)).toBe(true); expect(validZone('Mars/Olympus')).toBe(false); expect(validZone('')).toBe(false); });
```

- [ ] **Step 2: Run** `npx vitest run lib/when/slots.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/when/slots.ts`.** Zone maths with `Intl.DateTimeFormat` only (`hourCycle: 'h23'`): to find the instant of a local day and hour, guess from UTC, read the zone's offset at the guess, correct, and check the result formats back to the same local day and hour; when it does not, the hour does not exist and is left out. The earlier instant wins for a repeated hour. `needed`: majority `Math.floor(size / 2) + 1`, two thirds `Math.ceil(2 * size / 3)`, everyone `size`. `met` in `readiness` is `bestSlots(...)[0]?.people.length >= needed(threshold, sizeOf(expectedSize, answers.length))`, where only people with at least one slot count as answered.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Loopd When: slot and threshold maths`.

---

### Task 2: Tables, creating a poll, answering

**Files:**
- Create: `supabase/migrations/20261122000000_when.sql`, `lib/when/polls.ts`, `lib/when/notify.ts`
- Test: `lib/when/polls.test.ts`

**Interfaces:**
- Consumes: Task 1; `Db`, `Q` from `@/lib/db`; `Principal` from `@/lib/emba/access`; `openTestDb` from `@/test/db`.
- Produces:
  - `class WhenError extends Error { code: 'invalid' | 'not_found' | 'forbidden' | 'limit' }`
  - `createPoll(db: Db, p: Principal, input: unknown, now?: Date): Promise<{ id: string }>`; input `{ title, startDate, endDate, hourStart, hourEnd, timezone, expectedSize, deadline, threshold }`
  - `saveAnswer(db: Db, p: Principal, input: unknown, now?: Date): Promise<{ ready: boolean }>`; input `{ pollId, slots: string[] }`
  - `type Person = { personId: string; name: string }`
  - `type PollView = { id: string; seriesId: string; title: string; frame: Frame; threshold: Threshold; deadline: string; status: 'open' | 'sent'; ready: boolean; organizer: Person; isOrganizer: boolean; size: number; needed: number; answered: Person[]; counts: Record<string, number>; mine: { slots: string[]; draft: boolean } | null; best: { at: string; people: Person[] }[]; chosen: { at: string; note: string | null; in: Person[]; out: Person[] } | null }`
  - `pollView(db: Db, p: Principal | null, id: string): Promise<PollView | null>` (null for an unknown or malformed id; `counts` and `answered` leave drafts out)
  - `recordOpen(db: Db, pollId: string, visitor: string): Promise<void>` (one `poll_opened` row per poll and visitor)
  - `logEvent(q: Q, kind: string, poll: { id: string; seriesId: string }, visitor?: string): Promise<void>`
  - `notify(q: Q, pollId: string, personId: string, kind: 'reminder_48' | 'reminder_24' | 'ready' | 'deadline' | 'invite'): Promise<boolean>` (false when that person already has that kind for that poll)

- [ ] **Step 1: Write the migration.** Follow the header and `lock_timeout` convention of `20261120400000_campus_call_ask.sql`. Tables and columns exactly as the spec's Data section. Details the spec leaves:
  - `when_poll.id text primary key check(id ~ '^[A-Za-z0-9_-]{12}$')`; `organizer_id uuid not null references person(id) on delete cascade`; `series_id text not null`; `previous_poll_id text references when_poll(id) on delete set null`; title 1 to 80 characters, trimmed; `hour_start smallint` 0 to 23, `hour_end smallint` 1 to 24, greater than start; `end_date >= start_date and end_date - start_date <= 13`; `expected_size smallint` 2 to 200; `note text` up to 200; `sent_via text check(sent_via in ('loopd','google'))`; a check that `status='sent'` exactly when `chosen_slot` and `sent_at` are set.
  - `when_answer`: `poll_id` cascades, `person_id` cascades, `slots timestamptz[] not null default '{}'`, `stop_token text not null default replace(gen_random_uuid()::text,'-','')` unique.
  - `when_message`: `id uuid primary key default gen_random_uuid()`, `state text not null default 'queued' check(state in ('queued','sent','failed'))`, `attempts smallint not null default 0`, `claimed_at timestamptz`, `created_at`, `sent_at`, `provider_id text`, `unique(poll_id,person_id,kind)`; poll and person cascade.
  - `when_event`: `id bigint generated always as identity primary key`, `poll_id text references when_poll(id) on delete cascade`, `series_id text not null`, `visitor text check(visitor ~ '^[0-9a-f]{32}$')`, `at timestamptz not null default clock_timestamp()`; a unique index on `(poll_id, visitor) where kind='poll_opened'`; an index on `(kind, at)`.
  - Row level security on all four; revoke all from `public, anon, authenticated` (and on the identity sequence).
- [ ] **Step 2: Write the failing tests** in `lib/when/polls.test.ts`. Set up with `openTestDb()` in `beforeAll`, `reset()` in `beforeEach`; make people with `insert into person(name) values($1) returning id` and a `Principal` the way `lib/__tests__/campus-club-claim.test.ts` does. A helper `poll(over?)` creates the standard poll: title `Problem set night`, `2026-11-30` to `2026-12-04`, hours 17 to 22, `America/New_York`, expected 7, deadline `2026-11-27T23:00:00.000Z`, `two_thirds`, with `now = 2026-11-22T12:00:00Z`. Tests:
  - `createPoll` returns a 12 character id; `pollView` gives `size 7`, `needed 5`, `answered []`, `isOrganizer true` for the maker and `false` for null; writes one `poll_created` event.
  - refuses with `invalid`: empty title, `timezone: 'Mars/Olympus'`, `hourEnd <= hourStart`, a 15 day range, a deadline in the past, `expectedSize: 1`.
  - the 11th poll by one person inside 24 hours throws `limit`.
  - `saveAnswer` stores the slots, `counts[at]` becomes 1, `answered` names the person; saving again replaces, never doubles.
  - refuses with `invalid` a slot the poll does not have (`2026-12-01T10:00:00.000Z`) and the same slot twice; nothing is stored.
  - `pollView('nope')` and `pollView('x'.repeat(12))` are null.
  - ready: with expected 4 and `majority`, the third matching answer returns `{ ready: true }`, sets `ready_at` and `ready_met true`, queues exactly one `ready` message to the organizer and one `poll_ready` event; a fourth answer queues nothing more.
  - two `saveAnswer` calls for the third and fourth person run with `Promise.all` leave one `ready` message.
  - `recordOpen` twice with one visitor leaves one row; a second visitor makes two.
  - deleting a person removes their answers and their polls.
- [ ] **Step 3: Run** `npx vitest run lib/when/polls.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** `createPoll` validates with zod, checks `validZone`, makes the id from `crypto.randomBytes(9).toString('base64url')`, sets `series_id` to its own id. `saveAnswer` runs in `db.tx`: `select ... for update` on the poll, check every slot is in `slotsOf(frame)`, upsert with `draft=false`, log `response_saved`, then if `status='open'` and `ready_at is null` and `readiness(...).ready`, set `ready_at`, `ready_met`, `notify(q, id, organizerId, 'ready')`, log `poll_ready`. Names come from `person.name`.
- [ ] **Step 5: Run** the same command. Expected: PASS. Then `npx tsc --noEmit`.
- [ ] **Step 6: Commit** `Loopd When: tables, creating a poll, answering, ready`.

---

### Task 3: Picking the time and sending

**Files:**
- Create: `lib/when/send.ts`
- Test: `lib/when/send.test.ts`

**Interfaces:**
- Consumes: Task 2; `memberInviteIcs`, `fold` from `@/lib/ics`; `appUrl` from `@/lib/url`.
- Produces:
  - `sendPoll(db: Db, p: Principal, input: unknown, now?: Date): Promise<{ sent: boolean }>`; input `{ pollId, slot, note? }`. `sent: false` when it was already sent.
  - `pollIcs(view: PollView, attendee?: string): string | null` (null until sent; one hour event; without `attendee` it is a plain `METHOD:PUBLISH` file for the download)
  - `shareMessage(view: PollView): string` (open: `<title>: add the times you can make by <deadline>. <url>`; sent: `<title> is on: <Tuesday 1 Dec at 7 pm>. Add it to your calendar: <url>`)

- [ ] **Step 1: Write the failing tests.** Using Task 2's helper and three answers on `2026-12-02T00:00:00.000Z`:
  - the organizer sends that slot with note `Olin Library, room 301.`: `{ sent: true }`; `pollView` gives `status 'sent'`, `chosen.at`, `chosen.note`, `chosen.in` three people, `chosen.out` the one who answered other times; one `invite` message per person who answered plus the organizer (no doubles when the organizer also answered); one `poll_sent` event.
  - a second `sendPoll` returns `{ sent: false }` and adds no messages; two calls in `Promise.all` leave one set.
  - someone who is not the organizer gets `forbidden`; a slot outside the poll gets `invalid`; a note of 201 characters gets `invalid`; sending with no answers at all gets `invalid`.
  - sending is allowed before ready (one answer is enough).
  - `saveAnswer` after sending still works and moves a person between `chosen.in` and `chosen.out`, and the chosen time does not change.
  - `pollIcs` is null while open; once sent it contains `DTSTART:20261202T000000Z`, `DTEND:20261202T010000Z`, `SUMMARY:Problem set night`, and the note in `DESCRIPTION`.
- [ ] **Step 2: Run** `npx vitest run lib/when/send.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** One `db.tx`: lock the poll, return `{ sent: false }` unless `status='open'`, check organizer and slot, update, `notify(..., 'invite')` for each, log.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Loopd When: the organizer picks the time and sends`.

---

### Task 4: Email, reminders, the scheduled run

**Files:**
- Create: `lib/email/resend.ts`, `lib/when/emails.ts`, `lib/when/outbox.ts`, `app/api/cron/when/route.ts`, `app/api/when/stop/[token]/route.ts`
- Modify: `vercel.json` (add `{ "path": "/api/cron/when", "schedule": "*/15 * * * *" }`)
- Test: `lib/email/resend.test.ts`, `lib/when/outbox.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3; `clerkEmailOf` from `@/lib/emba/clerk-identity`; the guard in `app/api/cron/reach/route.ts` as the pattern for `CRON_SECRET`.
- Produces:
  - `type Mail = { id: string; from: string; to: string; replyTo?: string; subject: string; text: string; html: string; unsubscribeUrl?: string; calendar?: { method: 'REQUEST'; content: string } }`
  - `type SendResult = { ok: true; providerId: string | null } | { ok: false; retry: boolean }`
  - `resendSender(env?: Record<string, string | undefined>, fetcher?: typeof fetch): ((mail: Mail) => Promise<SendResult>) | null` (null without `RESEND_API_KEY`)
  - `renderWhenEmail(kind, d: { view: PollView; to: Person; stopUrl: string }): { subject: string; text: string; html: string; fromName: string }`
  - `whenSendingOn(env?): boolean` (`WHEN_SENDING === 'on'`)
  - `drainWhen(db: Db, carrier: { address: (personId: string) => Promise<string | null>; email: ((mail: Mail) => Promise<SendResult>) | null }, o?: { now?: Date; pollId?: string; budgetMs?: number }): Promise<{ readied: number; queued: number; sent: number; failed: number; retrying: number }>`

- [ ] **Step 1: Write the failing tests.**
  - `resend.test.ts`, with a fake `fetcher`: posts to `https://api.resend.com/emails` with `Authorization: Bearer <key>` and header `Idempotency-Key: <mail.id>`; the body has `from`, `to: [to]`, `reply_to`, `subject`, `text`, `html`, `headers` with `List-Unsubscribe: <url>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and for a calendar mail an attachment `invite.ics` with `content_type` `text/calendar; method=REQUEST`; 200 gives `{ ok: true, providerId }`; 429 and 500 give `{ ok: false, retry: true }`; 422 gives `{ ok: false, retry: false }`; a fetch that never answers is given up on after 5 seconds (fake timers) with `retry: true`; no key gives null.
  - `outbox.test.ts`, with a carrier that records mails:
    - a poll past its deadline with one answer becomes ready with `ready_met false` and its organizer gets one `ready` mail; run again: nothing more.
    - a poll that became ready early and is still open when the deadline passes gets one `deadline` mail.
    - a poll past its deadline with no answers is left alone.
    - reminders: on a repeat poll (insert a second poll with the first's `series_id`), 47 hours before the deadline a series person with no counted answer gets `reminder_48`, and at 23 hours `reminder_24`; a person who answered, and one with `reminders_off`, get neither; a first poll sends no reminders.
    - after `sendPoll`, a drain sends one mail per invite, each with a calendar part naming that attendee, `from` starting `Maya via Loopd <`, `replyTo` the organizer's address; rows become `sent` with `sent_at`.
    - a person whose `address` is null: their row is `failed`, the others are `sent`.
    - `retry: true` leaves the row `queued` with `attempts` 1; the fourth failure marks it `failed`.
    - `email: null` (no provider): readies and queues, sends nothing, marks nothing failed.
    - a `reminders_off` person still gets the `invite`. The stop link turns `reminders_off` on, tested through the route's handler with a real `stop_token`, and an unknown token answers 404.
- [ ] **Step 2: Run** `npx vitest run lib/email/resend.test.ts lib/when/outbox.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `drainWhen` order: ready the due polls (same rule and transaction shape as `saveAnswer`), queue due reminders and deadline nudges, then claim and send queued rows one at a time (`claimed_at`, skip rows claimed in the last 2 minutes, at most 4 attempts, stop when `budgetMs`, default 45000, is used). `from` is `"<fromName>" <WHEN_FROM>`. Email HTML is one table-free column of inline-styled blocks in the Cornell kit's colours from the mockup's screen 4 and 6; the text part says the same in plain lines. The cron route mirrors `app/api/cron/reach/route.ts`: 401 without the secret, `{ on: false }` when `whenSendingOn()` is false but still readies and queues (pass `email: null`), 503 when `NEXT_PUBLIC_APP_URL` is not https. The stop route answers GET with a small page saying reminders are stopped and POST with 200, both setting `reminders_off`.
- [ ] **Step 4: Run** the same command. Expected: PASS. `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `Loopd When: emails through Resend, reminders, the scheduled run`.

---

### Task 5: The pages

**Files:**
- Create: `app/when/layout.tsx`, `app/when/when.css`, `app/when/actions.ts`, `app/when/new/page.tsx`, `app/when/new/create-form.tsx`, `app/when/[id]/page.tsx`, `app/when/[id]/grid.tsx`, `app/when/[id]/pick.tsx`, `app/when/[id]/calendar.ics/route.ts`, `app/when/parts.tsx`
- Modify: `proxy.ts` (add `"/when/:path*"` to `matcher`, and to the list that lets a signed-out visitor through if there is one), the school gate only if `/when` is sent to the no-school page
- Test: `app/when/when-pages.test.tsx`, `app/when/[id]/grid.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 to 4; `SiteFrame` from `@/components/campus/site-frame`; `getSignedInPrincipal` from `@/lib/emba/portal-session`; `signInHref` from `@/lib/campus/session`; `ActionForm` as used in `app/a/[token]/page.tsx`.
- Produces:
  - actions `createPollAction(formData)`, `saveAnswerAction(pollId, slots: string[])`, `sendPollAction(formData)`; each asks `getSignedInPrincipal()` afresh, turns a `WhenError` into `{ error: string }`, and `sendPollAction` then calls `drainWhen(db(), carrier, { pollId, budgetMs: 8000 })` so invites leave at once.
  - `<Grid slots counts mine onSave />` client component; `<Ticket>`, `<Seats>`, `<Panel tab>` in `parts.tsx` matching the mockup's markup.

- [ ] **Step 1: Read** `node_modules/next/dist/docs/` for dynamic route params, server actions, route handlers and cookies in this version; read `app/a/[token]/page.tsx`, `app/a/share-page.test.tsx` and `app/organizers/page.tsx` for the page and test patterns.
- [ ] **Step 2: Write the failing tests.**
  - `grid.test.tsx` (Testing Library): a click toggles a cell's `aria-pressed`; pointer down on one cell and move over two more paints all three; starting on a picked cell erases; ArrowRight and ArrowDown move focus, Space toggles; the shown count is others plus one when picked; each cell has an `aria-label` like `Tue 1, 7 pm`; cells are at least 44px tall by class.
  - `when-pages.test.tsx`, rendering the page functions to static HTML with `openTestDb` and `withPortalTestSession`, as `app/a/share-page.test.tsx` does:
    - signed out, open poll: shows the title, `3 of 7 have answered`, the action `Sign in to add your times` linking to `signInHref('/when/<id>')`, and no grid buttons.
    - signed in, open: the action is `Save my times`; own picks are pressed.
    - the organizer, open with answers: shows `The times that work best`, the best time first and chosen, the action `Send it to everyone`.
    - sent: shows `It's on.`, the viewer's row first, then who is in, then who can't make it, the action `Add to my calendar` linking to `/when/<id>/calendar.ics`, and `Update your answer`.
    - an unknown id calls `notFound()`.
    - `/when/new` signed out: the action reads `Sign in to create the link`.
    - the calendar route answers 404 while open and `text/calendar` once sent.
    - no page's HTML contains an em dash or the words `fold in`.
- [ ] **Step 3: Run** `npx vitest run app/when/when-pages.test.tsx "app/when/[id]/grid.test.tsx"`. Expected: FAIL.
- [ ] **Step 4: Implement,** copying structure, class names and words from `public/demo/mockups-when.html` screen by screen (1 Create, 2 Answer, 3 Before signing in, 5 Ready, 7 Result). The layout wraps children in `SiteFrame`. The page sets the visitor cookie (`wn_v`, 32 hex characters, one year, `httpOnly`, `sameSite: 'lax'`) where this Next version allows it and calls `recordOpen`. Deadline and times are drawn with `slotLabel` in the poll's zone. The create form reads the browser's zone with `Intl.DateTimeFormat().resolvedOptions().timeZone` into a hidden field and keeps what was typed across the sign-in round trip in `sessionStorage`. The organizer's open page shows the WhatsApp and Copy share message from `shareMessage` (reuse `CopyText` from `@/components/emba/copy-link`).
- [ ] **Step 5: Run** the same command. Expected: PASS. `npx tsc --noEmit`, `npx eslint app/when lib/when lib/email`.
- [ ] **Step 6: Look at it.** With the founder's dev server on `localhost:3000`, open `/when/new` at 390px and at desktop width in the browser tool, compare with the mockup, and fix what differs. (Pages that read the database need the migration applied; if it is not, compare the signed-out create page only and say so.)
- [ ] **Step 7: Commit** `Loopd When: create, answer, pick and result pages`.

---

### Task 6: Ask the group again

**Files:**
- Create: `lib/when/repeat.ts`, `app/when/[id]/again/page.tsx`
- Modify: `app/when/actions.ts` (add `repeatPollAction`), `app/when/[id]/page.tsx` (the sent page links to `again` with an outlined pill, `Ask the group again`)
- Test: `lib/when/repeat.test.ts`, add cases to `app/when/when-pages.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 to 5.
- Produces:
  - `seriesView(db: Db, p: Principal, pollId: string): Promise<{ poll: PollView; people: Person[]; usual: string[]; past: { id: string; at: string; in: Person[]; size: number }[] } | null>` (null unless `p` is in the series; `usual` is the viewer's last counted answer as labels like `Tue 7 to 9 pm`, joining hours that touch)
  - `repeatPoll(db: Db, p: Principal, input: unknown, now?: Date): Promise<{ id: string }>`; input `{ pollId }`

- [ ] **Step 1: Write the failing tests:** only a series person may repeat (`forbidden` otherwise) and only a sent poll (`invalid`); the new poll has the same title, hours, threshold and zone, dates and deadline seven days on, `series_id` of the first poll, `previous_poll_id` set, `expected_size` equal to the series' people count, the repeater as organizer; each person's last counted answer is copied seven days on as a draft, with times that fall outside the new poll left out; drafts are not in `counts` or `answered`; a draft becomes counted when that person saves; a deadline that would already be past is set to 24 hours before the new start date's first slot, or refused with `invalid` if that is past too; one `repeat_created` event; a repeat across the March 2027 clock change keeps 7 pm at 7 pm. Page: `Same time next week?`, the usual times as chips, past sessions newest first, the action `Ask the group again`; the two flagged panels are absent unless `WHEN_WHERE=on`.
- [ ] **Step 2: Run** `npx vitest run lib/when/repeat.test.ts app/when/when-pages.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement,** from the mockup's screen 8.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Loopd When: ask the group again`.

---

### Task 7: The three numbers, and the notes

**Files:**
- Create: `lib/when/stats.ts`, `app/when/stats/page.tsx`, `WHEN.md`
- Test: `lib/when/stats.test.ts`

**Interfaces:**
- Produces: `whenStats(db: Db, now?: Date): Promise<{ opened: number; answered: number; answerRate: number | null; ready: number; readyMet: number; metRate: number | null; series: number; repeated: number; repeatRate: number | null }>`

- [ ] **Step 1: Write the failing test** from a known set of events: 4 visitors opened one poll and 3 people answered it gives `answerRate 0.75`; of 2 ready polls 1 met gives `metRate 0.5`; of 2 series one made a second poll 10 days after its first and the other 40 days after gives `repeatRate 0.5`; with no data every rate is null. Page: 404 unless `?key=` equals `WHEN_STATS_SECRET` (compared with `timingSafeEqual`, and 404 when the variable is unset); `robots` noindex.
- [ ] **Step 2: Run** `npx vitest run lib/when/stats.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `answerRate` is distinct people with a `response_saved` event over distinct visitors with `poll_opened`, across all polls.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Write `WHEN.md`:** routes, tables, the environment variables (`RESEND_API_KEY`, `WHEN_FROM`, `WHEN_SENDING`, `WHEN_STATS_SECRET`, `WHEN_WHERE`, and the existing `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`), and how to run the scheduled job by hand (`curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/when`).
- [ ] **Step 6: Finish.** Run every When test file once more by name, `npx tsc --noEmit`, and one `npm run build` with no other build running. Commit `Loopd When: stats page and notes`. Paste the migration's SQL and the founder's steps in the reply.

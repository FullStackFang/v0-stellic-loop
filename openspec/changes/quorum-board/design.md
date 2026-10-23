# Design

## Context

See proposal.md for motivation and `DESIGN.md` at the repo root for the product reasoning. Constraints that shape this slice:

- The look is settled: `quorum.html` v5 (commit 1ffca3a). Its CSS is the token and component source; the build ports it, it does not redesign it. Flows are those of the click-through: post, in / maybe / out, your days, the ask, lock, details, share.
- One builder plus subagents, no Docker, no local database. Development and tests run against two hosted Supabase projects (`board-dev`, `board-test`) that only the founder can create, plus a new Vercel project.
- No texts in this slice. Twilio 10DLC has weeks of lead time and the non-US share of the roster is unknown, so the slice is designed to be useful with the WhatsApp group as the only transport: the board link is pinned there, every share is a link, and the ON moment is visible on the page. The notifier is an interface with a logging implementation so the SMS slice adds a class, not a refactor.
- `web/` (campus MVP, Supabase Auth + Resend) shares nothing with this app. Patterns are borrowed (migrations with `supabase db push`, `board-test` reset before SQL tests, cron routes behind a bearer secret), code is not.

## Goals / Non-Goals

**Goals:**
- A deployed board at a stable URL that the cohort can use from the WhatsApp group with no texts: post, respond, see the ask, lock, share with a live unfurl.
- Quorum, conflict days and sort as pure TypeScript with unit tests; the ON latch enforced in the database (the `threshold_reached` event can exist once per proposal).
- Every state change recorded as an event with a source from day one, so the stats slice is a query, not a backfill.
- A `Notifier` seam with every message the product will ever send already named.

**Non-Goals:**
- Sending any SMS or WhatsApp message (slice 2: `quorum-board-sms`).
- Fork ("run this for your group"), digest page and weekly text, `/stats`, the CSV seed script (later slices). The schema anticipates them (`board.parent_board_id`, `proposal.version_of`, event sources) but no UI exists.
- Calendar connection (OAuth). Free days are a manual strip.
- Any editing of a live proposal's number or cost; "post a version" prefill covers it.
- Comments, chat, reactions, admin roles, money, push, email, native apps.
- Row-level security for browser clients: the browser never talks to the database.

## Decisions

**Stack: Next.js App Router + TypeScript + Tailwind at the repo root, Vercel, hosted Supabase Postgres as a plain database.** Same shape as `web/` so the founder's operational knowledge carries over, and Vercel gives the cron and the OG image route for free. Alternatives: reuse `web/` (different model, Supabase Auth by email; rejected per `DESIGN.md` call 1); SQLite on a VPS (no cron, no OG, more ops).

**All database access is server-side over a direct Postgres connection.** `lib/db.ts` (server-only) talks to Supabase Postgres with `pg` through `DATABASE_URL` (the transaction pooler); there is no service-role key and no supabase-js in the app. `anon` and `authenticated` get no grants; RLS is enabled with no policies so a leaked publishable key reads nothing. Pages are server components; mutations are server actions that check the session cookie and then write inside one real transaction (`Db.tx`). Reason: identity is ours (phone + cookie), so Supabase's row-level model has no `auth.uid()` to key on, and a single trusted path is simpler to audit than policies. A respond is several writes (response, event, roster) that must commit together, which the REST client cannot do; plain SQL also lets the same code run on in-process PGlite in tests. The connection string lives only in Vercel env.

**Identity: person = phone + name, session = signed cookie.** Phone normalised to E.164 with `libphonenumber-js` (default region US). The cookie `qb` is an HMAC-signed payload `{person_id, iat}` (`SESSION_SECRET`), httpOnly, SameSite=Lax, one year, refreshed on every mutation. Rules from `DESIGN.md`:
- Unknown number: name + number + the answer go through in one request; the person row is created, the cookie set, `person_added` written with the proposal that brought them.
- Known number with no cookie: the action returns `needs_code`; a six-digit code is generated, hashed into `otp_code`, handed to the notifier (`LogNotifier` prints it to the server log; in development the founder reads it from the Vercel log or the dev console). Five attempts, ten-minute expiry, then a new code.
- Magic tokens: `magic_token(token_hash, person_id, expires_at, used_at)`; `/m/<token>?to=<path>&src=<source>` sets the cookie and redirects. Nothing uses them until slice 2, but the route exists so links in texts are designed now.
- `person.show_name` (default true) and `person.sms_opt_out` (set by STOP in slice 2) live on the person, not per board.
Alternatives: Supabase Auth phone OTP (sends SMS on every sign-in, which contradicts "strangers get zero friction"); NextAuth (accounts, not phones).

**Schema** (ids `uuid`, times `timestamptz`, days `date`):
- `board(id, slug unique, name, tz default 'America/New_York', window_start date, window_end date, parent_board_id null, created_at)`
- `person(id, phone unique, name, show_name bool default true, sms_opt_out bool default false, created_at)`
- `board_person(board_id, person_id, joined_via source, via_proposal_id null, joined_at, pk(board_id, person_id))`
- `proposal(id, board_id, poster_id null, title, icon text default 'confetti', detail null, cost_text null, time_text null, needs_day bool, min_count int null, deadline date null, status enum open|on|closed, on_day date null, on_at null, locked_by null, closed_at null, version_of null, created_at)` plus `check (status <> 'on' or on_at is not null)`
- `proposal_detail(id, proposal_id, kind enum where|link|note, text, url null, added_by, added_at)`
- `response(proposal_id, person_id, answer enum in|out|maybe, days date[] not null default '{}', updated_at, pk(proposal_id, person_id))`
- `free_day(board_id, person_id, day, pk(board_id, person_id, day))`
- `share(id, proposal_id, token unique, sharer_id null, created_at)`
- `otp_code(phone, code_hash, expires_at, attempts, pending jsonb, pk(phone))` (pending = the answer or post to replay once the code checks out), `magic_token(token_hash pk, person_id, expires_at, used_at null)`
- `event(id, at, board_id, proposal_id null, person_id null, type event_type, source source, share_id null, data jsonb)` with `create unique index on event(proposal_id) where type = 'threshold_reached'` and the same for `proposal_idled`.
- enums: `event_type` = proposal_posted | response | threshold_reached | proposal_idled | proposal_reopened | proposal_closed | detail_added | person_added | share_minted | fork_created | text_sent; `source` = group_link | proposal_link | digest_link | on_text | one_more_text | maybe_nudge | fork | seed | direct.

"Idled" and "past" are computed at read time from `status`, `deadline`, `on_day` and today in the board's timezone; the cron only writes the `proposal_idled` event (once, by the partial unique index) so the stats slice has a timestamp.

**Quorum is a pure function, implemented once** in `lib/quorum.ts`: `heat(proposal, responses)` → counts per window day from `in` responses' `days`; `best` → the day with the highest count, earliest wins ties; `status` → `on` if latched, else `ready` when `needs_day ? best.count >= min : inCount >= min`, else `open`; `min = min_count ?? 4`. The poster's own response row is created on post (`in`, with their free days), so "the poster is in" is data, not a special case. The same module computes `conflictDays(person, board)` = days the person is `in` on an ON proposal with `on_day`, which tap-in subtracts and the card explains.

**Lock is one transaction with the latch in the database.** `lock(proposalId)` in a Postgres function: requires the caller to be `in`; recomputes status from rows; if not ready, returns `not_ready`; sets `status='on'`, `on_day` (best day, or null for no-day), `on_at`, `locked_by`; inserts `threshold_reached`. If the event already exists the unique index raises and the function returns `already_on`. The server action then calls `notifier.onReached(...)` outside the transaction, once, with the list of yeses, maybes, and people whose days did not include the locked day. Reason: two people tapping "Lock it in" at the same second must produce exactly one ON.

**Notifier interface** in `lib/notify/`: `onReached`, `oneMore`, `maybeNudge`, `dropped`, `code`, `magicLink`, each taking typed payloads with the recipients' person ids and the proposal; `LogNotifier` writes one structured line per would-be message and a `text_sent` event with `data.channel='log'`. Slice 2 adds `TwilioNotifier` and the `one more` trigger; this slice calls `onReached` and `code` only.

**Share and unfurl.** `POST /p/<id>/share` mints a 10-character token, writes `share` and `share_minted`, returns `/p/<id>?s=<token>`. The proposal page reads `s`, records it in the cookie-less visitor's first `response` event as `source=proposal_link, share_id`, and sets `<link rel=canonical href="/p/<id>">`, `og:image` = `/p/<id>/og?v=<responseCount>`, `og:title` = "6 of 8 in · Suits in Hoi An · Tue 16". The OG route uses `next/og` `ImageResponse` with the v5 palette and type, shows title, count line, best day and the board name, never a name, and sends `Cache-Control: no-store`. The page itself is dynamic (no ISR). Board links carry no token.

**`.ics` for ON with a day.** `/p/<id>/invite.ics` returns one all-day `VEVENT` on `on_day` (times are free text, so they go in the description with the cost and the proposal URL), `UID` = proposal id, `METHOD:PUBLISH`. Not found unless `status='on'` and `on_day` is set. The ON text in slice 2 links to it.

**Routes.** `/b/<slug>` board; `/b/<slug>/new` post form (`?from=<id>` prefills a version); `/b/<slug>/you` your days and settings; `/p/<id>` proposal page (the card expanded: heat, your days, the ask, details with add row, who's in, share); `/p/<id>/og`, `/p/<id>/invite.ics`; `/m/<token>`; `/api/cron/daily`. Everything renders in the phone-width layout of v5 at any viewport; the side rail of the demo is not built.

**Visual port.** `app/globals.css` is `quorum.html` v5's `<style>` block with the side-rail and `.phone` chrome removed and the custom properties kept verbatim. Components in `components/`: `Hero` (server shell + client `Field` canvas: the Dusk gradient, grain, orbit rings with Twist rotation, graphite mesh, IntersectionObserver pause, reduced-motion still frame, ported from `quorum.html`), `DateBlock`, `Plate` (Phosphor Fill paths on Delta-palette plates), `MiniHeat`, `Ask`, `Acts`, `Chip`, `GhostButton`, `Pill`, `SectionHead`, `Toast`. Fonts via `next/font/google` (Source Serif 4, Geist). No component library.

**Timezone.** `board.tz` governs "today" for deadlines, idling and heat labels; computed with `Intl.DateTimeFormat` and `date-fns-tz`-free helpers in `lib/days.ts` (window days are a `date[]`, which avoids DST arithmetic entirely).

**Cron.** `vercel.json` runs `/api/cron/daily` at 06:00 UTC with `CRON_SECRET` as bearer: writes `proposal_idled` for open proposals past their deadline. Idempotent by the partial unique index.

**Testing.** Vitest for `lib/quorum.ts`, `lib/days.ts`, cookie and token signing, phone normalisation, sort, and component rendering with Testing Library (board, proposal page, post form). SQL tests in `supabase/tests/` against `board-test` (reset with `supabase db reset --db-url`, then `db push`, then seed): constraints, the `lock` function's latch under two concurrent calls, the partial unique indexes. Server actions get integration tests for respond (unknown number, known number without cookie, change answer, conflict days) and lock. The integration suites run on in-process PGlite with the real migrations by default (`npm test`) and against `board-test` under `npm run test:db`, so they run on every change without a hosted project. No Playwright suite in this slice.

## Implementation notes (2026-10-22)

Decided while building; the rest of this document still holds.
- `poster_id` is nullable because the seeded proposals have no people; `icon` holds the plate glyph the poster picks (the demo's icon set).
- Identity lives in `lib/identity.ts` (`withIdentity`), called inside each action's transaction, not in a separate `actions/identify.ts`. A replay after a code always *sets* the pending answer; it never toggles it off.
- Next.js `cacheComponents` is off: every page is per viewer and live.
- Reopen is refused once the window is over (`window_over`), as well as when not idled.
- Attached `days` arrays are kept sorted on write.
- The live database is `supabase-loop` (`gtxvuhxjequvhxuerfdw`), a Vercel-integration Supabase project, standing in for `board-dev`; 0001–0004 and the seed were applied through the Supabase MCP and recorded in `supabase_migrations.schema_migrations`. 0004 pins `lock_proposal`'s search_path (advisor 0011). The app reads `DATABASE_URL`, else the integration's `POSTGRES_URL`, with TLS but no CA verification.
- `scripts/local-db.mjs` serves PGlite over the wire protocol for local dev and screenshots (no Docker); `--demo` loads the demo's people.

## Risks / Trade-offs

- [Two people lock at once] → the latch is a unique index inside the `lock` function; the second caller gets `already_on` and the page simply shows ON.
- [A known number on a new device cannot receive the code because no SMS exists yet] → in this slice the founder reads codes from the server log and relays them; the cohort is sixty known people on their own phones, so the path is rare until slice 2. Documented in the README as a known gap.
- [WhatsApp caches the first preview of a URL] → every share mints a new URL; the board link's own preview is the board's static OG image (name and open count are fine to be stale there).
- [Day heat reveals a person when only one person is in] → the proposal page already shows names to anyone with the link, so counts of 1 reveal nothing new; the OG image shows totals only.
- [Free text times and costs] → by design (`DESIGN.md`); `.ics` is all-day with the time in the description.
- [No RLS, one server-only connection] → one trusted server path and no public key with grants; the risk moves to the server actions, which is why every mutation checks the cookie and the person's relation to the proposal first and is integration-tested.
- [Twilio lead time] → not needed for this slice; registration starts now so slice 2 is not blocked.
- [`libphonenumber-js` default region US] → non-US numbers must include `+country`; the form says so. Revisit with the non-US count.

## Migration Plan

1. Founder creates `board-dev` and `board-test` Supabase projects and switches the existing `v0-stellic-loop` Vercel project (root directory = repo root) to the Next.js preset; the app is the repo root, and the static demos moved to `public/demo/` (served at `/demo/stellic`, `/demo/quorum`, `/demo/mockups-…`, with old `*.html` URLs redirected); sets `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`; locally also `SUPABASE_TEST_DB_URL`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY`.
2. `supabase db push` to `board-dev`; run the seed (one board `emba27`, window Feb 14–20 2027, the trip five proposals from `DESIGN.md`, no people).
3. Deploy; founder posts the first real intents and pins `/b/emba27` in the WhatsApp group.
4. Rollback: the app is additive and separate; unlinking the Vercel project or un-pinning the link is the whole rollback. Data stays in `board-dev`.

## Open Questions

- Non-US numbers on the roster: how many? Decides SMS vs WhatsApp in slice 2 and whether `libphonenumber-js` default region should be removed.
- +1s: default taken is none in v1. If wanted, `response.plus` int and every count changes; cheap to add before the trip, costly after people have answered.
- Deadline default for needs-day proposals: this design idles them at the board's `window_end` when no deadline is set (the window is the day). Confirm, or keep them open forever like no-day proposals.

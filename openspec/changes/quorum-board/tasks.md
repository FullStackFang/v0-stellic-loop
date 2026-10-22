# Tasks

Order: 1 → 2 → 3 → 4 → {5, 6, 7} → 8 → 9. Group 1 is founder-only and gates every database test and the deploy; everything in 2, 3 and the pure-function parts of 4 can be written and unit-tested before it lands. Cut line for the cohort: all of 1–8 live at `/b/emba27` before the first real intent is posted; 9 is cleanup that can follow.

Tests run against `board-test` only, never `board-dev`. No Docker, no local Supabase.

## 1. Founder prerequisites

- [ ] 1.1 Create Supabase projects `board-dev` and `board-test` (hosted); verify both show in `supabase projects list`
- [ ] 1.2 Create Vercel project `quorum-board` linked to this repo with root directory `board/`; verify a hello-world deploy serves at the project URL
- [ ] 1.3 Set Vercel env for Production and Preview: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (32 random bytes), `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`; set `SUPABASE_TEST_DB_URL` locally only; verify `board/.env.local` has every key named in `board/.env.example`
- [ ] 1.4 Start Twilio 10DLC brand and campaign registration (needed by the SMS slice, not this one); verify the registration shows pending in the Twilio console

## 2. Scaffold

- [ ] 2.1 `npx create-next-app@latest board` (TypeScript, App Router, Tailwind, no src dir, ESLint); remove the starter page; add `.env.example`; verify `npm run build` passes
- [ ] 2.2 Add deps: `@supabase/supabase-js`, `libphonenumber-js`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`; add `test` and `test:db` scripts; verify `npm test` runs an empty suite green
- [ ] 2.3 Port `quorum.html` v5 `<style>` to `board/app/globals.css` with the custom properties verbatim and the side rail / `.phone` chrome removed; load Source Serif 4 and Geist via `next/font/google`; verify a static page renders a `.card` pixel-close to the demo at 390px wide
- [ ] 2.4 Write `board/README.md`: env keys, how to run, how to reset `board-test`, the known gap (codes are read from the server log until SMS ships); verify it matches the scripts in package.json

## 3. Database

- [ ] 3.1 Write `board/supabase/migrations/0001_schema.sql`: enums, tables board / person / board_person / proposal / proposal_detail / response / free_day / share / otp_code / magic_token / event per design.md, the `status <> 'on' or on_at is not null` check, and the partial unique indexes on `event` for `threshold_reached` and `proposal_idled`; verify `supabase db push` against `board-test` succeeds
- [ ] 3.2 Write `0002_lock.sql`: `lock_proposal(p_id, p_person)` as a single function that checks `in`, recomputes readiness from rows, sets `status/on_day/on_at/locked_by`, inserts `threshold_reached`, and returns `locked | not_ready | not_in | already_on`; verify two concurrent calls from a test script yield exactly one `locked` and one `already_on`
- [ ] 3.3 Write `0003_grants.sql`: enable RLS on every table with no policies; revoke all from `anon` and `authenticated`; verify a `supabase-js` client with the publishable key gets zero rows from every table
- [ ] 3.4 Write `board/supabase/seed.sql`: board `emba27` (window 2027-02-14 to 2027-02-20, tz America/New_York) and the five trip proposals from DESIGN.md with no people; verify the seed is idempotent (run twice, same row counts)
- [ ] 3.5 Write `board/supabase/tests/` runner (`test:db`): reset `board-test` with `supabase db reset --db-url`, push, seed, then run SQL assertions for: unique phone, one response per person per proposal, once-only events, the check constraint, and 3.2's latch; verify `npm run test:db` is green

## 4. Core library (pure, unit-tested)

- [ ] 4.1 `lib/days.ts`: window days as `date[]` strings, "today" in a board tz via `Intl.DateTimeFormat`, end-of-day comparisons, short labels (Sun 14); verify unit tests cover DST week and tz boundary at midnight
- [ ] 4.2 `lib/quorum.ts`: `heat`, `best` (earliest wins ties), `minOf` (default 4), `readiness` for needs-day and no-day, `conflictDays`, `sortBoard` (nearest-to-minimum, ties newest; then ON; then past/idled), `idledAt` (deadline, window end for needs-day, never for no-day); verify unit tests for every scenario in quorum-and-lock, free-days and board-page specs
- [ ] 4.3 `lib/phone.ts`: normalise to E.164 with US default region, reject invalid; verify tests for "(607) 555-0123", "+44 20 7946 0958", "123"
- [ ] 4.4 `lib/session.ts`: HMAC-signed cookie `qb` {person_id, iat}, one-year expiry, verify-or-null, refresh; `lib/tokens.ts`: share token (10 chars), six-digit code with hash, magic token with hash; verify tests for tamper, expiry, and uniqueness over 10k tokens
- [ ] 4.5 `lib/notify/`: `Notifier` interface (`onReached`, `oneMore`, `maybeNudge`, `dropped`, `code`, `magicLink`) with typed payloads; `LogNotifier` that writes one structured log line and a `text_sent` event with `channel: 'log'`; verify a unit test asserts one event per call
- [ ] 4.6 `lib/db.ts`: service-role client factory (server only, throws if imported in a client component); `lib/events.ts`: `writeEvent` with source resolution from the request (share token → `proposal_link` + share id, magic `src`, else `group_link`); verify an integration test against `board-test` writes and reads an event with the expected source
- [ ] 4.7 `lib/ics.ts`: one all-day `VEVENT`, `METHOD:PUBLISH`, `UID` = proposal id, description with time text, cost and URL, CRLF line endings, 75-octet folding; verify output parses with a strict iCalendar validator in the test suite

## 5. Identity and sessions

- [ ] 5.1 `actions/identify.ts`: `withIdentity(form)` resolves the cookie, else takes name + phone; unknown phone → create person, set cookie, return person and `person_added` pending; known phone without cookie → store hashed code, call `notifier.code`, return `needs_code`; verify integration tests for all three paths against `board-test`
- [ ] 5.2 Code entry: `actions/verifyCode.ts` with five attempts and ten-minute expiry, then records the pending answer; verify tests for correct, wrong ×5, expired
- [ ] 5.3 `app/m/[token]/route.ts`: single-use magic token sets cookie and redirects to a same-origin `to` with `src`; used or expired token redirects without cookie; verify tests for fresh, used, expired, off-origin `to`
- [ ] 5.4 `components/IdentityFields.tsx`: name + phone fields that appear inline under the action when there is no cookie, plus the code field when `needs_code`; verify a rendering test shows no fields with a cookie and both without

## 6. Proposals, responses, days

- [ ] 6.1 `app/b/[slug]/new/page.tsx` + `actions/post.ts`: title, needs-a-day switch, fold with detail, cost, time, minimum, links one per line; `?from=<id>` prefill sets `version_of`; posting creates the proposal, poster's `in` with free days, `link` details, `proposal_posted`; verify integration tests for minimal post, links, version, and stranger-posts
- [ ] 6.2 `actions/respond.ts`: set / change / clear answer with days attached on `in` (free days minus conflicts), `response` event with prev/next and source, `dropped` notifier call for the poster when an `in` leaves an ON proposal; verify tests for every scenario in intent-response and the conflict scenario in free-days
- [ ] 6.3 `actions/days.ts`: set free days per person per board; propagate to open needs-day `in` answers, never to ON; per-proposal day adjustment; verify tests for "mark a day free", "ON untouched", "per-proposal adjustment"
- [ ] 6.4 `actions/details.ts`: add link / where / note when `in`, with `detail_added`; poster edits detail line and time; refuse title/number/cost edits; verify tests for in, not in, and poster-only edits
- [ ] 6.5 `app/b/[slug]/you/page.tsx`: the 7-day free strip, your open and ON proposals, the show-my-name switch; verify a rendering test with a fixture person

## 7. Quorum, lock, lifecycle

- [ ] 7.1 `actions/lock.ts`: calls `lock_proposal`, then on `locked` calls `notifier.onReached` once with yeses, maybes, and can't-make-its; maps `not_in` / `not_ready` / `already_on` to the page; verify an integration test with two parallel calls produces one `onReached`
- [ ] 7.2 `components/Ask.tsx`: the v5 ask block with "Not yet" (client-side dismiss, stored in `localStorage` per proposal) and "Lock it in" / "It's on"; after lock, the `.me` confirmation line then the ON card state; verify a rendering test for needs-day and no-day copy
- [ ] 7.3 `app/p/[id]/invite.ics/route.ts`: 200 with `text/calendar` for ON with a day, 404 otherwise; verify tests for both
- [ ] 7.4 `actions/lifecycle.ts`: poster close (`proposal_closed`), poster reopen at a lower number (`proposal_reopened`, deadline → window end, no notifier call); verify tests for close, reopen, reopen-refused-when-not-idled
- [ ] 7.5 `app/api/cron/daily/route.ts` behind `CRON_SECRET`: write `proposal_idled` for open proposals past `idledAt`; `vercel.json` cron at `0 6 * * *`; verify a test runs it twice and finds one event per idled proposal

## 8. Pages, share, unfurl

- [ ] 8.1 `app/b/[slug]/page.tsx`: hero (`Hero` server shell + client `Field` canvas ported from `quorum.html`, reduced-motion still frame), live label counts, sections Open / On / Past with `sortBoard`, `Card` with `DateBlock`, `Plate`, facts, `MiniHeat`, `Ask`, faces, `Acts`; verify a rendering test for the ordering scenario and a screenshot at 390px matches the demo's board
- [ ] 8.2 `app/b/[slug]/opengraph-image.tsx`: board name only; verify the route returns a PNG
- [ ] 8.3 `app/p/[id]/page.tsx`: the proposal page (chip, mini heat, your days row, the ask, details with add row, In / Maybe lists honouring `show_name`, share, post a version, poster controls); `generateMetadata` sets `og:title`, `og:image` with `?v=<count>`, canonical bare URL; verify a rendering test and a metadata test
- [ ] 8.4 `app/p/[id]/og/route.tsx`: `next/og` image with title, count line, best or locked day, board name, no names, `Cache-Control: no-store`; verify the route returns a PNG with the header and a snapshot test at two counts
- [ ] 8.5 `actions/share.ts` + Share button: mint token, `share` row, `share_minted`, copy `/p/<id>?s=<token>` to the clipboard with a toast; entry via `?s=` is carried into the session's source; verify tests for two shares and for attribution of a stranger's first response
- [ ] 8.6 Deploy to the Vercel project, `supabase db push` + seed to `board-dev`, open `/b/emba27` on a phone; verify post, in, days, ask, lock and share all work end to end on the live URL and a share URL unfurls in WhatsApp with the count

## 9. Hardening

- [ ] 9.1 Rate limits on identify, verifyCode and share (per IP and per phone, in-memory per instance is enough); verify tests for the sixth code attempt and twenty shares a minute
- [ ] 9.2 Sweep every page at 390px and 1280px, keyboard-only, and with `prefers-reduced-motion`; fix anything that breaks the v5 look; verify screenshots in `board/docs/` for board, proposal, post and you
- [ ] 9.3 Run `npm run lint`, `npm test`, `npm run test:db`, `npm run build`; verify all green and recorded in the README

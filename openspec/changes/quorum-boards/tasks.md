# Tasks

Order: 1 → 2 → 3 → {4, 5, 6} → 7 → 8. The look is `quorum.html` v5 throughout and is enforced by the gates in 7.1: `app/globals.css` does not change, every class the new screens emit exists in `public/demo/quorum.html`, and screenshots are compared against the mock. No date pickers, no new tokens, no emoji.

## 1. Prerequisites

- [x] 1.1 Archive `quorum-board` (`/opsx:archive quorum-board`) so `openspec/specs/` holds `quorum-and-lock`, `board-page` and `free-days`; verify `openspec validate quorum-boards` passes against them
- [x] 1.2 Record the base commit for the CSS gate (`git rev-parse HEAD` before any change) in this file
  - Base: `7a26f1d55d62d62d054eb2df2004b7d7478dad05`

## 2. Database

- [x] 2.1 Write `supabase/migrations/0005_boards.sql`: `window_kind` with default `'fixed'`, nullable `window_start`/`window_end`, the kind/dates check (`window_end - window_start between 0 and 13`), nullable `event.board_id`, `alter type event_type add value 'board_created'`; verify on PGlite that `emba27` from the seed is `fixed` with its dates, Mar 1–14 is accepted, Mar 1–15 and a rolling board with dates are rejected
- [x] 2.2 In the same migration replace `lock_proposal()`: window from the kind and today in the board timezone (`greatest(window_start, today)`, `coalesce(window_end, today + 13)`), fixed-only implied idle, `search_path` pinned; verify `lock.test.sql` still passes and new cases lock on rolling day 14, refuse day 15, refuse a past-day best, and lock a best day after the deadline

## 3. Window library

- [x] 3.1 `lib/types.ts` (`Board.window_kind`, nullable dates) and `lib/load.ts`; verify `tsc` lists every direct reader of the stored dates
- [x] 3.2 `lib/days.ts`: `ROLLING_DAYS = 14`, `windowOf(board, today)`, `countedDays(board, today)`, `windowLabel(board, today)` ("Next two weeks" for rolling), strip label dates ("Nov 23 – Dec 6"); switch `Shell.tsx`, `BoardView.tsx` and `lib/view.ts` to them; verify unit tests for midnight rollover, the Oct 25–Nov 7 2026 clock change, a fixed window mid-trip, and that a grep for `window_start`/`window_end` outside `lib/days.ts`, `lib/load.ts` and SQL is empty
- [x] 3.3 `lib/quorum.ts`: heat and best over counted days; `idledAt` from the deadline, or the fixed window end for needs-a-day on fixed boards; card heat row picks days 1–7 or 8–14 by the best or locked day; verify unit tests for every scenario in `board-window` and the modified `quorum-and-lock`
- [x] 3.4 Counted days in text and tap-in: `attachableDays` (`lib/ops.ts`), `freeDays` consumers, `peopleLists` (`lib/view.ts`) and `YouView` list only counted days; verify the "Yesterday on a rolling board" scenario end to end

## 4. Rolling behaviour in actions

- [x] 4.1 `postAs`: implied `deadline = today + 13` for needs-a-day posts on rolling boards; refuse needs-a-day posts on a fixed board whose window is over ("This board's dates are over."); verify integration tests for both and that fixed boards before their window are unchanged
- [x] 4.2 `reopenProposal`: deadline to the end of the current window; same-or-lower minimum on rolling, lower-only on fixed; refuse when a fixed window is over; verify tests for each
- [x] 4.3 `setFreeDay` / `setProposalDay`: refuse days outside the current window or before today; verify tests for yesterday and day 15
- [x] 4.4 Daily cron: verify by test that implied deadlines on a rolling board produce exactly one `proposal_idled` event per proposal

## 5. Board creation

- [x] 5.1 `lib/slug.ts`: `slugify` (NFKD, 28-char base, random fallback) and the insert-on-conflict allocation loop with the `^base-[0-9]+$` suffix match; verify tests for "Ski Club '26!", accents, a 60-character name, a symbols-only name, `strategy-team` vs `strategy-team-building`, and two concurrent starts of the same name both succeeding
- [x] 5.2 Identity for boards: `Pending` gains `{ kind: "board", name, tz }`; `issueCode` and the `text_sent` event work with no board id; `verifyCode` replays the board draft and returns a destination path; respond and post callers move to the path; verify integration tests for a known number starting a board through the code, and that existing respond/post code replays still pass
- [x] 5.3 `actions/board.ts` `createBoard`: per-IP in-memory limit (5/h), per-number limit from `board_created` events in the last hour inside the transaction (3/h), timezone validated with `Intl.supportedValuesOf`, slug, insert, `joinBoard` source `direct`, one `board_created` event with source `direct` and `{"window":"rolling"}`; verify integration tests for a new number, a bad timezone, and the fourth board in an hour
- [x] 5.4 `app/page.tsx` start-a-board form: mast, `.field` name, `IdentityFields` (with code stage), hidden timezone, one pill; verify a rendering test for signed-out, signed-in and code states
- [x] 5.5 Empty board in `BoardView`: `.empty` text and one `.ghost` "Copy the link" in an `.acts` row (clipboard + toast), no second post button; verify a rendering test for a board with no proposals
- [x] 5.6 Unlisted: `app/robots.ts` disallowing `/b/` and `/p/`, `robots: { index: false, follow: false }` on board and proposal pages; verify a test that fetches both

## 6. Strips, hero and copy names

- [x] 6.1 `DayStrip`, the proposal page heat and the You page: the whole window in rows of seven; past days with `.day.busy`, empty `src`, `aria-disabled`, no handler; window dates in the `Sect` label; card `.mini`/`.minil` unchanged with past cells blank; verify rendering tests for a rolling 14-day strip and a fixed mid-trip strip and card
- [x] 6.2 `Hero` label "§ 01 · Next two weeks" on rolling boards through `windowLabel`; verify a rendering test
- [x] 6.3 `components/CopyNames.tsx` as a third `.ghost` in the proposal page `.acts` row: format, the viewer's real name, name switch, "and N more", Maybe line, toast "Copied the list · N in", shown only when someone is in; verify unit tests for the formatter and a rendering test

## 7. Look and verification

- [x] 7.1 The look gates: (a) `git diff --quiet <base from 1.2> -- app/globals.css` passes; (b) a rendering test asserts every class emitted by the start-a-board form, the empty board, CopyNames and a 14-day DayStrip exists as a selector in `public/demo/quorum.html`; (c) screenshots of `/`, a new empty board, `example-team` with 12 open and 3 ON, a rolling proposal page with Copy names, and the You page at 390px and 1280px and with reduced motion into `docs/`, each compared with the mock; verify all three pass
- [x] 7.2 `scripts/local-db.mjs --demo`: `example-team` and `example-club` (rolling) with people, posters, answers and implied deadlines so ready and ON states show; verify a local walkthrough: start a board, post, tap in with days, lock, copy names, a known number starting a board through the code
- [x] 7.3 Run `npm run lint`, `npm test`, `npm run build`; verify all green and recorded in the README

## 8. Ship

- [x] 8.1 Apply `0005_boards.sql` to `supabase-loop` via the Supabase MCP, record the version, re-run the security advisors; verify `emba27` is unchanged and the publishable key still reads nothing (2026-10-24: run by the founder in the SQL editor, so not in the migrations list; verified: window_kind, board_window, nullable event.board_id, board_created, new lock_proposal with search_path=public; emba27 fixed Feb 14–20, 5 proposals, 5 events; anon cannot read board or execute lock_proposal; advisors show only the expected INFO rls_enabled_no_policy)
- [x] 8.2 Push `main`; verify on the live site: `/b/emba27` unchanged, `/robots.txt` serves, start a board from `/`, then remove the test board and its rows (2026-10-24: 98dbc56 pushed and deployed; /robots.txt disallows /b/ and /p/; /b/emba27 200, noindex, Feb 14–20; / shows Start a board; rolling render checked with a board inserted by SQL and then deleted. The phone-code path was not run in prod: codes go to the log notifier)

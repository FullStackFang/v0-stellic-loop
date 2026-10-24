## Why

The live board (`/b/emba27`) only works for a group that shares one fixed week, and only we can make a board. The trip is in February, so the first real use would wait three months. A team room or a club runs on "the next two weeks", and a club president is the person who would start the next board. If a team or club can start its own board in November, the board gets real use before the trip and proves that someone other than us posts.

## What Changes

- **Rolling window.** A board is either *fixed* (the trip board: Feb 14–20, unchanged) or *rolling*: its window is always today plus the next 13 days in the board's timezone. Free days, tap-in, heat, best day, the ask and lock all work on that moving window with the same math. Past days stop counting.
- **Idling on a rolling board.** A rolling board has no window end, so a needs-a-day intent posted there gets an implied deadline: the last day of the window it was posted into (posted day + 13). Reopen moves that deadline to the end of the current window and, on a rolling board, may keep the same minimum. No-day intents still never idle.
- **Start a board.** The home page (`/`) gets "Start a board": a name, and the starter's name and number on the first visit. Every board started there is rolling, in the starter's browser timezone; fixed-date boards (like the trip) stay founder-made by SQL. The board gets a readable slug and lands empty with the link ready to copy. The starter has no special powers; boards stay ownerless and unlisted (no search indexing). This is the same creation path a later fork ("run this for your group") will reuse.
- **Copy the roster.** The proposal page's In list gets "Copy names", which copies a plain list ("Ski trip · 7 in: Priya, Marcus, … and 2 more"), honouring each person's name switch and never including numbers. This gives a club president a count they can act on.
- **Example boards, local only.** `scripts/local-db.mjs --demo` adds a team board (`example-team`: "Room after class Thu", "Case prep Sunday") and a club board (`example-club`: four interest intents with no day and one dated event), both rolling, with people, posters and answers. They are not in the live seed, where nobody could close or reopen them.
- **The look is fixed.** Every new screen and state (the start-a-board form, the 14-day strip, the rolling hero label, the empty board, the copy button) is built only from classes that exist in `quorum.html` v5. `app/globals.css` does not change at all, and a test checks that every class the new screens emit exists in the mock. No date pickers, no new tokens, no emoji.

Out of scope, each for a later change: a place entity on intents, a booking step at lock, the SMS slice (codes by text, the "one more" text, inviting a pasted member list), forks, editing or deleting a board.

## Capabilities

### New Capabilities
- `board-window`: fixed versus rolling windows; which days a board shows and counts; how past days and the board timezone apply.
- `board-creation`: starting a board from the home page (name, window, slug, identity), landing on the empty board, rate limits, and the event it writes.
- `roster-copy`: the copyable list of names on a proposal page.

### Modified Capabilities
- `quorum-and-lock`: "Deadlines, idling, past and closing" and "Reopen at a lower number" change for rolling boards (implied deadline on post; reopen moves it to the current window's end).
- `board-page`: "Hero with live stats" shows "Next two weeks" instead of fixed dates on a rolling board.
- `free-days`: "Free days per person per board window" covers a 14-day rolling window (two strip rows), and days before today no longer count.

These capabilities are defined in `openspec/changes/quorum-board/`, which is not archived yet. Archive `quorum-board` before this change so the deltas apply to its specs.

## Impact

- **Database:** a migration makes the board's window dates nullable and adds a window kind, adds `board_created` to `event_type`, makes `event.board_id` nullable (a code sent before the board exists has no board), and replaces `lock_proposal()` so it reads the rolling window. The live seed is unchanged.
- **Code:** `lib/days.ts` and `lib/quorum.ts` (window days from the board kind and today), every reader of window dates (`components/Shell.tsx`, `BoardView.tsx`, `lib/view.ts`), `lib/ops.ts`/`lib/load.ts` (counted days only), `actions/post.ts` and `actions/lifecycle.ts` (implied deadline, post refused after a fixed window), a new `actions/board.ts` and `lib/slug.ts`, `lib/identity.ts` and `actions/verifyCode.ts` (a board draft as pending; verify returns where to go), `app/page.tsx` (start a board), `app/robots.ts` and page metadata (noindex), `components/DayStrip.tsx`, `Hero.tsx`, `ProposalView.tsx`, the daily cron (unchanged logic, now sees implied deadlines), `scripts/local-db.mjs`.
- **No new dependencies.** No change to sessions, share or unfurl; identity gains one pending kind.
- **Live data:** `emba27` is untouched; the migration is additive for fixed boards.

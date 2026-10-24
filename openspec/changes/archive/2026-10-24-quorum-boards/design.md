## Context

`quorum-board` shipped one live board, `emba27`, at the repo root on Vercel (`v0-stellic-loop`) with Supabase `supabase-loop` behind it. Every board today has a fixed `window_start`/`window_end`, read directly in `lib/days.ts` (`windowDays`, `windowLabel`), `lib/quorum.ts` (heat, best, `idledAt`), `lib/view.ts` (the "No days yet" date block), `components/Shell.tsx` (header meta), `components/BoardView.tsx` (hero label), the `lock_proposal()` SQL function and `actions/lifecycle.ts` (reopen). Boards only exist through the seed.

The look is settled: `quorum.html` v5 (now `public/demo/quorum.html`), ported verbatim into `app/globals.css`. The founder asked that it be retained. This change adds screens and states, never a new visual direction, and does not touch `app/globals.css`.

A Fable review on 2026-10-23 found two blockers (code issuance before a board exists; slug collisions) and seven mock-retention issues; all are resolved below.

## Goals / Non-Goals

**Goals:**
- A team or a club can start a board on its own in November and use it week after week.
- The same heat, ask and lock work on a window that moves with the calendar.
- A president can lift the list of who's interested off an intent.
- The trip board behaves exactly as before, except that past days stop counting and posting after its dates is refused.

**Non-Goals:**
- Fixed-date boards from the UI (the founder makes them by SQL), place entities, booking at lock, forks, editing or deleting boards.
- Anything that needs SMS: codes by text, the "one more" text, inviting a pasted member list.
- Recurring availability ("free every Thursday"). See Open Questions.
- Any CSS change or new visual element.

## Decisions

**Window kind on the board row, rolling dates computed, not stored.** Add `window_kind text not null default 'fixed' check (window_kind in ('fixed','rolling'))`, make `window_start`/`window_end` nullable, and add `check ((window_kind = 'fixed' and window_start is not null and window_end is not null and window_end - window_start between 0 and 13) or (window_kind = 'rolling' and window_start is null and window_end is null))`. One `windowOf(board, today)` in `lib/days.ts` returns `{start, end}` for both kinds, and `windowLabel(board, today)` returns the dates or "Next two weeks". Every reader listed in Context switches to these; a grep for `window_start`/`window_end` outside `lib/days.ts`, `lib/load.ts` and SQL must come back empty. *Alternative:* a nightly job that rewrites the stored dates of rolling boards. Rejected: wrong between midnight and the job, and a stored date that is secretly derived invites bugs.

**The rolling length is one constant.** `ROLLING_DAYS = 14` lives in `lib/days.ts`. The SQL function repeats it as `13` (end offset) with a comment naming the TS constant, and a test locks a proposal whose only heat is on window day 14 and fails to lock one whose only heat is on day 15.

**Past days are filtered at the window, not at storage.** `countedDays(board, today)` is the window intersected with `>= today`. Heat, best, readiness, the lock SQL, the days attached on tap-in (`attachableDays`), the days listed next to names (`peopleLists`) and on the You page all use counted days. Free days and response days in the past stay in the tables as history. In the full strips (`.days`), a past day keeps v5's `.day.busy` class (tinted, number struck through) with an empty `src` label, `aria-disabled="true"` and no click handler; no CSS is added. In the card heat (`.mini`), which has no struck state, a past cell is blank, the same as a day nobody is free. On a rolling board the window starts today, so both only show on a fixed board mid-window. *Trade-off accepted:* v5 uses `.day.busy` for "busy on your calendar"; reusing it for "already happened" is tolerable because both mean "can't be this day" and the calendar connection is not built, so the two meanings never meet on screen. If the calendar ships, revisit.

**Implied deadline instead of a new idling rule.** On a rolling board, `postAs` sets `deadline = today + 13` for needs-a-day posts with no deadline, and `reopenProposal` sets it to the end of the current window. Everything downstream (`idledAt`, `lock_proposal`'s idle check, the daily cron) already handles deadlines. The deadline bounds when the proposal can lock, not which day: a best day after the deadline is allowed (the window has rolled forward since posting). On a fixed board, `postAs` refuses needs-a-day posts once the window is over. *Alternative:* idle when no in-person's days remain in the future. Rejected: harder to explain on the card and to test, and it makes idling depend on other people's edits.

**Reopen on a rolling board allows the same minimum.** A new two-week window is a fresh chance, so forcing a lower number would push people to lie about what they need. Fixed boards keep "lower only".

**`lock_proposal()` reads the window kind.** Migration `0005_boards.sql` replaces the function: `today := (now() at time zone b.tz)::date`, `v_start := greatest(b.window_start, today)` (null-safe: `greatest` ignores nulls), `v_end := coalesce(b.window_end, today + 13)`; the day filter becomes `d.day between v_start and v_end`; the idle check uses `coalesce(p.deadline, case when p.needs_day and b.window_kind = 'fixed' then b.window_end end)`. `search_path` stays pinned as in 0004.

**Card heat shows one row, the page shows all.** The card heat (`.mini` with `.minil`) stays one row of seven, unchanged in markup and CSS: the first seven window days, or days 8 to 14 when the best or locked day is there. The weekday letters do not say which week; the date block beside it does, so no dates are added to the row. The proposal page heat, "your days" and the You page strip use `.days`, whose seven-column grid wraps a 14-day window into two rows with no CSS change, and their `Sect` label's plain text carries the window dates ("Nov 23 – Dec 6") so a month boundary reads correctly. *Alternative:* a 14-cell mini row. Rejected: it halves the cell width and changes the card the founder signed off.

**Start a board lives on the home page, rolling only.** `/` keeps its mast ("Your group's board") and gains a form built only from post-form parts: `.field` for the name, `IdentityFields` for a cookieless visitor (including the code stage), one pill button, and a hidden timezone field from `Intl.DateTimeFormat().resolvedOptions().timeZone`, validated server-side with `Intl.supportedValuesOf('timeZone')` and falling back to America/New_York. No date inputs and no window switch: native date pickers would bring browser chrome the mock does not have, and the only fixed board is the trip. *Alternative:* a "Fixed dates" switch with date fields. Rejected after review for the mock and because no non-trip group needs it.

**Codes before a board exists.** `withIdentity` and `issueCode` today need a `boardId` because `notifier.code` writes a `text_sent` event and `event.board_id` is not null. Migration 0005 makes `event.board_id` nullable; the existing `Events never leave the server` rule is unaffected. `Pending` gains `{ kind: "board", name, tz }`. `verifyCode` replays it through the same `createBoard` core and returns a destination path (`/b/<slug>` or `/p/<id>`) instead of a proposal id; the respond and post callers map their current behaviour onto the path. The home form handles `needs_code` the same way the post form does.

**`createBoard` in one transaction.** In `actions/board.ts`: per-IP best-effort limit (the existing in-memory limiter, 5 per hour per instance); per-number limit counted from `board_created` events for that person in the last hour, inside the transaction, so it holds across Vercel instances; `withIdentity` with the board pending; slug; insert board; `joinBoard` with source `direct`; one `board_created` event with source `direct` hard-coded (not `attribution()`, which would report `group_link`) and data `{"window":"rolling"}`; redirect to `/b/<slug>`.

**Slugs without exceptions.** `slugify(name)`: NFKD, strip combining marks, lowercase, non-alphanumerics to single hyphens, trim hyphens, cut the base at 28 characters without leaving a trailing hyphen; empty becomes a 6-char base62 slug. Allocation loops `insert into board (...) values (...) on conflict (slug) do nothing returning id`, trying the base, then `-2`, `-3`, …, starting from one past the highest existing `slug ~ ('^' || base || '-[0-9]+$')` suffix. No unique violation is ever raised, so the transaction never aborts and identity never re-runs.

**The empty board.** When a board has no proposals, `BoardView` renders the existing `.empty` text ("Nothing posted yet. Post the first thing you could do.") and one `.ghost` "Copy the link" in an `.acts` row, the same pattern as `ShareButton`. The hero's "Post an intent" stays the only post action.

**Copy names is client-only and lives in the actions row.** The proposal page's existing `.acts` row (Share, Post a version) gains a third `.ghost`, "Copy names", when at least one person is in; the row is checked at 390px. The page already receives the In and Maybe lists with the name switch applied (`peopleLists`). `components/CopyNames.tsx` formats "<title> · N in" / "names and N more · Maybe: names", using the viewer's real name for their own row, writes to the clipboard, and toasts "Copied the list · N in". No server call, no event.

**Unlisted boards.** `app/robots.ts` disallows `/b/` and `/p/`; board and proposal pages set `robots: { index: false, follow: false }` in metadata. Readable slugs are guessable and a `-2` confirms a name exists; that enumeration is an accepted risk, since a board page shows only what anyone with the link already sees.

**Example boards are local demo data.** `scripts/local-db.mjs --demo` creates `example-team` and `example-club` (rolling) with people, posters, answers and implied deadlines, so ready and ON states show locally. They are not in `seed.sql`: on the live site, seeded intents with no poster could never be closed or reopened and would sit as open cards forever.

**Event type.** `alter type event_type add value 'board_created'` runs in 0005. Since Postgres 12 this is allowed inside a transaction; the new value just cannot be used in that same transaction, and neither 0005 nor the seed uses it.

**The look is enforced, not hoped for.** Three gates: (1) `git diff --quiet <base> -- app/globals.css` passes, with no named exceptions; (2) a rendering test collects every `className` emitted by the start-a-board form, the empty board, CopyNames and a 14-day DayStrip and asserts each exists as a selector in `public/demo/quorum.html`; (3) screenshots at 390px and 1280px and with reduced motion, including a rolling board with double-digit counts so the one-line hero label is proven to fit.

## Risks / Trade-offs

- [Free days are dates, so a team has to re-mark next week's Thursday] → acceptable for the first boards; tap-in carries whatever is marked, and the strip is two taps. Recurring availability is the first open question.
- [Anyone can start a board, including spam boards] → per-number limit in the database, per-IP best effort, unlisted pages. Deleting boards is out of scope; the founder can remove one by SQL.
- [`.day.busy` means "past" here and "calendar-busy" in the mock] → never both on screen while the calendar is unbuilt; revisit with the calendar.
- [A blank past cell on a card looks like "nobody free"] → only on a fixed board mid-window, and the date block shows the real best day.
- [The hero label is one line (`nowrap`)] → screenshot gate with "12 open · 3 on" at 390px.
- [Past-day filtering changes trip behaviour mid-trip] → only days that already happened stop counting; nothing before Feb 14 2027 changes.
- [Two places hold the 14-day constant (TS and SQL)] → the day-14 / day-15 lock test.
- [This change modifies specs that live in the unarchived `quorum-board` change] → archive `quorum-board` first; its open tasks are founder-side.

## Migration Plan

1. Archive `quorum-board` so `openspec/specs/` holds its capabilities.
2. Apply `0005_boards.sql` (window kind, nullable dates, check, nullable `event.board_id`, `board_created`, new `lock_proposal()`) to `supabase-loop` through the Supabase MCP, recording the version like 0001–0004. `emba27` becomes `window_kind = 'fixed'` by the column default with its dates intact. Re-run the security advisors.
3. Deploy by pushing `main`; Vercel builds from the repo root.
4. Rollback: the migration is additive for fixed boards. Reverting the app leaves rolling boards unreadable by the old code but harmless to `emba27`; delete rolling boards by SQL if a rollback is ever needed.

## Open Questions

Settled 2026-10-23: club or team first does not matter to the founder; both example boards ship together and get equal polish.

- Recurring availability: should "free every Thursday" exist, and is it per board or per person? Decide after watching the first team board for two weeks.
- Should a board starter be able to rename the board? Kept out (ownerless); revisit only if real boards need it.

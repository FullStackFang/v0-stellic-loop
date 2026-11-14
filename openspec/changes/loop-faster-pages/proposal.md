## Why

Signed-in group pages take many seconds to appear. Measured on 2026-11-13 with `scripts/perf-probe.ts`: the database is 85ms away per query (Oregon; production ran in Virginia), and one team page view made about 230 queries, most of them one after another. A first pass in the working tree cut the wait from roughly 10 seconds to roughly 4.5 on a laptop. This change records that pass and takes two more steps that cut the work a page does.

What this change does not do is make the page fast from a laptop that is 85ms from the database. A review of the first draft (2026-11-13) showed why: of the 46 or so queries still in a row, 34 are the sign-in check, the list of groups and each read's access checks, and this change leaves those alone. The local wait goes from about 4.3 seconds to about 3.9. The steps that move it further are listed under "Not in this change" and are the founder's to decide.

## What Changes

Already built in the working tree (recorded here, tests green):

- The sign-in check and the list of a person's groups run once per page view, not once in the side menu and again in the page.
- On the site, listing a person's groups takes a fixed number of statements (18) however many groups they have. It was 14 per group.
- Each team read spends 4 fewer statements before its own work.
- The team, members and resources pages start their reads together. The connection pool holds 10, up from 5.
- Group pages show "Opening…" when opened from another page under `/groups`.
- Production functions run in Portland (`pdx1`), next to the database. Takes effect on the next deploy, and is what makes production fast.

To build:

- **Fewer statements per list.** Showing a list of records takes two statements where it takes eight today; a list of asks takes three where it takes up to eight.
- **Read only what is shown.** The team page shows one tab at a time and reads all seven. It will read the header and the shown tab only: three or four reads where there are nine.
- **The connections page** lists groups once, from the same listing the side menu uses.

Not in this change. Each needs the founder's go-ahead, and together they are what would bring the local wait under 2 seconds:

- Checking access once per page view instead of once per read (about 9 statements per read today).
- Starting a page's reads before the list of groups has finished (18 statements in a row today). **Built on 2026-11-13 after the founder's go-ahead**: see tasks section 5.
- Moving the development database closer to the laptop.
- Fewer checks on the sign-in itself (two calls to Clerk and 7 statements per page view).

Considered and dropped: drawing the team page in pieces under Suspense. The header's own read is the slowest on the page, so the shown tab would always be ready first and nothing would be seen to load.

Not looked at: form submits (an action checks sign-in and access again, then the page is drawn again; about 100 statements in a row), and the pages `/groups`, `/a/[token]`, `/e/[token]`.

## Capabilities

### New Capabilities

- `page-speed`: how much work a signed-in page view may do, what it may skip, and what a person sees while it loads. Every rule keeps today's access checks and read records.

### Modified Capabilities

None. No page shows anything different once loaded, and no access rule changes.

## Impact

- Code: `lib/emba/team-records.ts` (`viewRecords`, `viewPeople`), `lib/emba/team-asks.ts` (`viewAsks`, `openAsks`), `lib/emba/team-core.ts` (`viewMembers`), `lib/emba/team-interest.ts` (`interested`), `app/groups/[namespace]/team/page.tsx`, `app/groups/connections/page.tsx`. Already changed: `lib/emba/portal-session.ts`, `groups.ts`, `access.ts`, `consent.ts`, `team-core.ts`, `lib/db.ts`, the pages under `app/groups/`, `vercel.json`.
- Assistants: the connector's team tools use the same list builders, so they do less work too. What they return does not change.
- Database: no migration. No new table, column, function or index.
- Read records: a team page view writes fewer `plan:read` rows, because it no longer reads tabs that are not shown.
- Tests: the list builders are covered by `emba-team-read`, `emba-team-records`, `emba-club-asks`, `emba-club-events` and `emba-team-mcp`; the page by `app/groups/team-page.test.tsx`.

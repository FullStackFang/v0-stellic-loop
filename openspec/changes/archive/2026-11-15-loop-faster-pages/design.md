## Context

A signed-in page waits for (statements in a row) × (time per statement). From the founder's laptop a statement takes 85ms, so the count in a row is the whole story locally. In production the region change makes each statement a few milliseconds, so there the count matters for load, not for the wait.

A statement here is one round trip to the database, including `begin` and `commit`. The test wrapper does not see `begin` and `commit`, so a budget in a test is two lower per transaction than the same budget in this document.

State after the first pass, measured with `scripts/perf-probe.ts` against the hosted database (owner, 2 groups). The team measured has **no records**, so every list is the empty case:

| Step of a team page view | Statements | In a row? |
|---|---|---|
| Sign-in check (two calls to Clerk, then a transaction) | 7 | yes |
| List of groups | 18 | yes |
| `teamState` | 14 (35 with records in all three lists) | the nine reads run side by side |
| `teamBrief` | 26 | |
| `listTeamEvents` | 11 | |
| `myRecentRecords` | 10 | |
| `briefHistory` | 9 | |
| `upcomingEvents` | 15 | |
| `listTeamEvents` (archived) | 10 | |
| `listAsks` | 22 | |

On this team the slowest path is 7 + 18 + 26 = 51 statements, about 4.3 seconds. On a team with records it is 7 + 18 + 35 = 60.

Reads that go through `reading()` (`teamState`, `teamBrief`, `myRecentRecords`, `upcomingEvents`, `listAsks`) spend 9 statements on checks and bookkeeping: begin, isolation, four for access, the team's head, the read record, commit. `listTeamEvents`, `briefHistory` and the `post` check are plain transactions that check access and write no read record.

Where a read's own work goes: `list()` is one statement for the rows, then `viewRecords` adds five (tags, conflict flags, links, overlaps, events) and `viewPeople` two (people, namespace). `viewAsks` is four statements, then `viewMembers` adds up to three. `teamBrief` calls `openAsks`, which checks `post` (4 statements) and builds full views of up to 30 asks to count the ones waiting for the reader.

Constraints:

- The access layer is deliberate. Every read checks the person, the sign-in and the role inside its own transaction and takes share locks. This change keeps all of that.
- The same list builders serve assistants through the connector. Their output is a contract and must not change.
- No migration: the founder applies migrations by hand, and nothing here needs one.
- Tests run on PGlite, which returns `int8` and `numeric` as numbers where `pg` returns text.

## Goals / Non-Goals

**Goals:**

- Fewer statements for the same page, with budgets set from a measurement on a seeded team (task 2.1) and held by tests.
- Expected, from reading the code: the slowest path of a team page goes from 51–60 statements to about 46; the default tab's total goes from about 135 to 75–85.
- Every access check and lock that runs today for data that is shown still runs.
- Assistants get the same answers.

**Non-Goals:**

- A fast page from a laptop 85ms from the database. The 25 statements of sign-in and group listing, and the 9 per read, are left alone; see the proposal.
- Checking access once per page view, or sharing one transaction between reads.
- Looking a group up by its address before the list of groups has finished. (Reversed on 2026-11-13: built as D6.)
- Moving the database, or caching anything between requests.
- Streaming parts of a page (dropped; see D3).
- Form submits, and the pages `/groups`, `/a/[token]`, `/e/[token]`, `/emba`, `/b`, `/p`, `/trip`.
- Changing what any page shows, its markup once loaded, or its styling.

## Decisions

### D1. Fewer statements per list, built in SQL

- `viewPeople` folds the namespace lookup into its people statement. For the site, `viewMembers` gets names from that same statement. The name is selected only when `clientId` is null, so it cannot reach an assistant.
- `viewRecords` becomes one statement for tags, conflict flags, links, overlaps and event slugs, as JSON columns beside each row (`coalesce((select json_agg(... order by ...) ...),'[]')`). People depend on the tag rows, so they stay a second step: `viewPeople` runs after it. A list of records is then `list()` + `viewRecords` + `viewPeople` = 3 statements where it is 8.
- `viewAsks` becomes one statement for options and answers as JSON columns. Posting members are the same for every ask of the team, so they are read once in a CTE of that statement, not repeated per row. With `viewMembers`, a list of asks is ids + `viewAsks` + people = 3 statements where it is up to 8.
- `interested()` in `team-interest.ts` is brought to the same shape.
- `openAsks` gets a count-only path for `teamBrief`, which uses only two numbers from it. The brief stops building 30 ask views to count them.
- `viewEvents` is one statement already and is left alone.

The shaping code in TypeScript stays and reads from the JSON columns in place of the separate row sets.

Order: where today's statement has an `order by`, the aggregate states the same one. Answers, posting members, people and interest have none today, and their order on screen comes from `byName`, which ties for two former members. Each gets a stated order with the id as the last key, in SQL or in `byName`, so the output is the same on every run. That is a change of order only where today's order is already unstated.

Timestamps stay top-level columns (`createdAt`, `closesAt` already are), so nothing inside JSON passes around the parsers in `lib/db.ts`.

Alternative considered: run the lookups side by side. They share one transaction, which is one connection, so they cannot. Alternative considered: a database function per view. It needs a migration and moves display logic into the database.

### D2. The team page reads the header and the shown tab only

- **Header** (always): `teamState` and `teamBrief` (counts, deadline, purpose, today), `listTeamEvents` (the events fact), and one `manage` check. The asks count in the tab bar comes from `brief.asks.open`, which uses the same rule for "open" as `listAsks`.
- **Shown tab** (one of): decisions, claims and outputs need nothing more; events needs `upcomingEvents`, the `post` check and, for a manager, archived events; asks needs `listAsks` and the `post` check; brief needs `briefHistory`; "Your saves" needs `myRecentRecords`.

Whether the person is a manager is read today from whether `briefHistory` was refused. `briefHistory`'s rule is first-party plus `manage`, and a site principal is always first-party, so the header asks `canAccessLoop(..., 'manage')` directly.

The header's reads and the tab's reads start together, as the nine do today. The default tab makes four reads where there are nine.

### D3. No streaming (dropped)

The first draft put the shown tab under `<Suspense>`. It is dropped:

- Every tab's read is shorter than the header's `teamBrief`, and they start together, so the tab is ready first and a fallback would never show.
- The three default tabs need no read of their own.
- A failure inside a boundary goes to the nearest `error.tsx`, a client component that replaces the whole page; there is none under `app/groups`.
- `app/groups/team-page.test.tsx` renders the awaited page with Testing Library, which cannot render a nested async component.

It becomes worth a second look only if the sign-in and group listing stop being the part everything waits for.

### D4. Access is untouched; read records follow reads

No statement in `reading()`, `authorize`, `canAccessLoop`, `canAccessPersonal` or `audit` changes in the steps still to build. D1 changes only statements that run after those checks, in the same transaction and snapshot. D2 removes whole reads; a read that does not run writes no record, which is correct, since nothing was read.

### D5. The budget is a test, set from a seeded team

Budgets are fixed after task 2.1 measures a seeded team (records in every list, an announcement, open and closed asks with answers, interest in an event). Tests then hold:

- a list of 1 and of 20 records cost the same number of statements, and likewise asks;
- `teamState`, `teamBrief` and `listAsks` each stay at or under the number written beside them in the test;
- the site's group listing stays independent of the number of groups (in place).

The comparison of answers before and after (tasks 2.2, 2.7) runs on PGlite and once against the hosted database with `QB_DB=remote`, because only `pg` shows a number arriving as text.

`scripts/perf-probe.ts` stays as the way to measure against the real database. It is read-only: one transaction, rolled back. It runs reads one after another on one connection, so it reports each read's count and time, not a page's wait; it gains a seeded-team option and the `manage` check in task 2.1.

### D6. A page's reads start beside the group listing

Added on 2026-11-13 with the founder's go-ahead. The page finds which group its address names with one statement that checks nobody's access and shows nothing, then starts its reads and the listing of groups together. Every read still checks the person, the sign-in and the role in its own transaction, so a read of a group closed to the person is refused and writes no read record. The listing still decides whether there is a page: what the reads returned is dropped unless the listing holds the same group. An address that names no live group, or more than one, falls back to listing first.

## Risks / Trade-offs

- [The local wait barely moves: about 3.9s from 4.3s] → Stated in the proposal. The value of this change is less load and fewer read records per view; the wait needs a deferred item.
- [A folded statement returns a number as text under `pg`] → Counts are cast to `int`; the before-and-after comparison runs against the hosted database once.
- [Stating an order where there was none changes what a person sees] → Only among people `byName` already treats as equal; a test pins the new order.
- [One large statement is slower for the database than several small ones] → Lookups are by primary key or an indexed `any($1)`. Not every list is capped at 30: events list up to 200, answers and posting members have no cap. `perf-probe` reports time as well as count.
- [For an assistant, listing groups still makes two lease lookups per group] → Left as is and stated in the spec; the site is what was slow. Batching the lease lookup is a small follow-up.
- [The manager check moves from "history was refused" to a direct check] → Same rule. A test covers a member, an organizer and a follower.
- [Nine transactions at once open nine connections, each with a TLS handshake, and `pg` closes them after 10s idle] → D2 brings the default tab to four. The pool has no connection timeout, so an exhausted pool waits without limit; task 3.5 adds one.
- [`loading.tsx` makes every link under a group prefetchable, and each prefetch passes Clerk in `proxy.ts`] → Not measured. Task 1.11 checks it in the browser.

## Migration Plan

No data changes. Ship D1 and D2 as separate commits so each can be reverted alone. The region change in `vercel.json` ships with the first deploy; to undo it, remove the `regions` line.

## Open Questions

- Which deferred item, if any, does the founder want: access checked once per page view, reads started before the group listing finishes, a closer development database, or a lighter sign-in check? Without one, a team page stays near 4 seconds from the laptop.
- Should "Opening…" be styled? It is plain text, and the look belongs to the founder.
- Is 10 connections per server instance right with more than a handful of people at once? It has not been load-tested.

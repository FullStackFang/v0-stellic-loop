## Context

The app is Next.js 16 (App Router) on Vercel in `pdx1`; Postgres is Supabase in `us-west-2`, reached through the transaction pooler; sign-in is Clerk. Every page under `/groups` and `/c` is rendered per request.

What one signed-in page view does today, from a read of the code on 2026-11-20 (statement counts, `begin`/`commit` included; nothing below was timed in production):

| Part | Statements | Runs |
|---|---|---|
| Identify the person (`getClerkPortalPrincipal`, then `inAGroup`) | 8 to 9, in a row, plus 2 Clerk calls | every page and every action |
| List the person's groups (`discover` + tree facts) | 18, in a row | once per page view |
| "On you" counters (`onYou`) for 5 groups | about 155, about 73 in a row | every full load of a bar |
| Account card (`campusViewer` + `campusScreen`) | about 24, in a row, plus 1 Clerk call | every full load of a bar |
| Assistants page | 2, then 12 beside the listing | the page |

Measured from a laptop about 80 ms from the database: one statement 80 ms, an empty transaction 250 ms, the listing 1.5 to 1.7 s. In production a statement is expected to cost a few ms (same region; not measured: per-route metrics need Observability Plus).

After this change (2026-11-20, laptop, round trip 75 ms, the development database, as the member there in the most groups: 5 groups). Taken on one connection inside one rolled-back transaction, so the times are the sequential cost; the app runs some of these side by side, and the counts are exact:

| Part | Before | After |
|---|---|---|
| Identify a known account | 8 to 9 statements in a row | 1 statement, 78 ms |
| "On you" counters, 5 groups | about 152 statements (a second listing, and 3 post checks per group) | 95 statements, 7.4 s sequential (the second listing alone was 17 statements, 4.8 s) |
| Account card | 20 statements, 1.55 s (campus screen) | 14 statements, 1.09 s sequential, in two waves in the app |
| Assistants page grants | 12 statements in three reads, 0.93 s | 8 in one transaction, 0.62 s |
| The page view's listing (unchanged) | 18 statements, 1.48 s | the same, now made once per view |

Constraints:
- `openspec/specs/page-speed/spec.md` requires that every read keeps its checks of the person, the sign-in and the role inside its own transaction, and still records its `plan:read`.
- Reads lock what they check (`for share`), so a revoke waits for a read in progress and never lands in the middle of one.
- Other sessions have uncommitted work in this folder: commit only the files changed, by path.

## Goals / Non-Goals

**Goals:**
- Fewer statements in a row on every signed-in page, with no change to who may see what or to what is recorded.
- One place that reads what the account card shows.
- Each change small enough to land and be reverted on its own.

**Non-Goals:**
- Caching pages or data between requests (`unstable_cache`, removing `force-dynamic`): a separate change.
- The three guarantee-changing items under Open Questions.
- Spend caps, rate limits and bot protection: a separate change.
- Any change to what a page looks like.

## Decisions

### D1. A known account is identified by one statement; enrolment keeps its transaction

`getClerkPortalPrincipal` first runs one statement: the identity for (issuer, subject), not revoked, with no deletion tombstone, the person's name, and whether the person belongs to any group. If it finds the account and nothing needs writing (the name is already set, or Clerk has none to give), the principal is built from that row. Otherwise it falls through to today's transaction unchanged (advisory lock, `person for update`, insert, `nameIfUnnamed`, `authenticate`).

- Why: for a known account today's transaction only reads; the locks protect the insert, which the fast path never does. The row lock on `person` taken on every request also makes a member's own writes wait behind their own page views.
- `inAGroup` is folded into the same statement so `getPortalPrincipal` does not ask again; `getSignedInPrincipal` ignores the answer.
- The principal must still be made by `authenticate` (it carries the `authority` mark that `valid()` checks). `authenticate` is given the row already read, or a variant that takes it, so no second statement is made. To be confirmed while building: that this can be done without exporting the mark.
- Alternative considered: keep the transaction and drop only the locks. Rejected: still 5 statements, and two code paths that look alike.

### D2. The counters take their groups from the page view, and check a group once per transaction

`onYou` receives the groups from `portalGroupTree(principal)` (the listing the page view already made) in place of calling `listGroups` again. Inside `teamOnYou`, the person's access to the group is checked by the first read and the answer is carried to the other reads of the same transaction.

- Why: the second listing repeats 17 statements and writes a second set of read records for the same view. Four checks of the same person and group inside one transaction, with the rows locked by the first, cannot give different answers.
- To be confirmed first (task 2.1): that the four `canAccessLoop` calls in `teamOnYou` do run in one transaction. If any runs in its own, it keeps its own check.
- How the answer is carried: an optional argument on the internal readers, set only by `teamOnYou`. No module-level or per-request memo: an answer must never outlive its transaction.
- `onYou` is also called for assistants (`waiting` over MCP). That path keeps `listGroups`, with its consent checks; only the site path is given the groups.
- Alternative considered: one SQL statement for all groups' counters. Rejected for now: a rewrite of the asks, events and claims readers, and the saving after this change is small.

### D3. The account card has its own read

A new `accountViewer(db, campus, viewer)` returns exactly the `viewer` part of `Screen` (what `Account` in `components/campus/screen.tsx` draws: face, picks, schools, plan, level, colours, groups links), reading in one wave. `campusScreen` calls it for its own `viewer`, so there is one implementation. The groups layout and `app/c/site-bar.tsx` (pages that are not the week itself: Ink, Doodles, organizers) call `accountViewer` and pass a `Screen`-shaped value with empty lists, or `Account` is changed to take the viewer and campus alone, whichever touches less.

- Why: the bar uses none of the week (tickets, places, live counts), yet it is read, with a Clerk `getUserList` call for other people's photos, and serialized to the browser.
- `looks()` in the groups layout reads the face and plan again; it is replaced by the same read, keeping its fallback (a plain card) when the read fails.
- Alternative considered: `cache()` around `campusScreen`. Rejected: the bar and the week page are different requests on most navigations.

### D4. The Assistants page reads together

`hasAssistants`, `noteConnectView` and the listing start together (the listing is the one the bar shares). `listLeases`, `listRemovedGroupGrants` and the clock become one transaction with one personal check and one `lease:list` record. A person without Ink+ still sees only the subscribe card; the listing they did not need is one the bar makes anyway on a full load.

### D5. Order and proof

Order: D1, D2, D3, D4. Each lands as its own commit with its tests. For each, the statement count before and after is asserted in a test where one exists (`emba-team-speed.test.ts` counts statements) and noted in the commit message. After all four, the laptop timings in Context are taken again and written into this file.

## Risks / Trade-offs

- [D1 skips a lock that something relied on] → The fast path only reads; the enrol path is unchanged. A revoked identity or a tombstone is in the statement's `where`, so both still refuse. Test: revoke, then request.
- [D1 changes when a name is filled in] → The fast path is not taken while the stored name is the placeholder and Clerk has a name.
- [D2 carries an answer too far] → The answer is an argument passed down inside one `tx` callback; a test revokes the role between two `teamOnYou` calls and expects the second to refuse.
- [D2 changes read records] → The second listing's `plan:read` rows are no longer written because that read no longer runs; the first listing's rows are. Per-group reads keep theirs.
- [D3 drifts from the campus screen] → One function, called by both.
- [Counts here are from reading, not measuring] → D5 measures.
- [The gain in production may be small] → Stated in the proposal; the saving there is connections, lock time and one Clerk call, not seconds.

## Migration Plan

No schema change. Each decision is one commit on `main`, pushed and merged by pull request (which deploys). Rollback is reverting that commit.

## Open Questions

For the owner. Each is outside this change until answered; a yes adds a task group and a spec delta.

1. **Listing groups on the site:** may it check access once under lock, in place of three times in the same transaction? Saves 8 statements in a row. The review found no race the repeats catch beyond a session expiring in those milliseconds; the test that pins them (`emba-groups.test.ts:117-120`) revokes on the same connection, which no other session can do.
2. **Read records for the site:** do you need a record every time a member views their own groups, or only when an assistant reads? Today about 15 rows are written per full load; they are read only by the old `/emba` portal (newest 100) and the privacy export, and nothing removes them.
3. **Clerk session check:** is up to a minute's delay before a revoked or banned session stops seeing pages acceptable, if every action still checks live? Probably the largest saving in production; the Clerk calls should be timed there first.
4. **Development database:** a second Supabase project near the laptop would make localhost several times faster with no code change. Wanted?

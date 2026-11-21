## Why

A signed-in page makes far more database round trips than it needs, most of them one after another. A review of the request path (2026-11-20, by reading the code; counts are not timings) found that the bar's "On you" counters alone make about 155 statements for a person in five groups, that identifying the person costs 7 to 8 statements and two Clerk calls on every page and every action, and that the bar reads a whole campus week to draw one account card. In production the database is beside the functions and each statement is cheap, but the count still costs connections, lock time and money; from a developer's laptop each statement is about 80 ms and pages take seconds.

## What Changes

Four changes that keep every access and audit guarantee:

- **Identifying a known account is one statement.** Today every request opens a transaction, takes an advisory lock and a row lock on the person, and reads four times, even for an account seen a thousand times before. The locked enrolment runs only for an account not yet known, or one whose name is still to be filled in.
- **The counters use the page view's listing of groups**, and check a person's access to a group once per transaction in place of four times.
- **The bar's account card has a read of its own**, in place of the whole campus screen, in both bars (the groups pages and the campus pages).
- **The Assistants page starts its reads together**, and reads the person's grants in one statement.

Three further changes alter a guarantee. They are written down here as questions for the owner and are NOT part of this change until answered (design.md, Open Questions):

- the site's listing of groups checking access once under lock, not three times in one transaction;
- no record of a read when a member views their own groups on the site (assistant reads still recorded);
- remembering the Clerk session check for up to a minute for page views (every action still checks live).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `page-speed`: adds requirements for identifying a known account, for the counters, for the account card and for the Assistants page; and says that a check made once inside a transaction holds for that transaction.

## Impact

- `lib/emba/clerk-identity.ts` (`getClerkPortalPrincipal`, `enrolClerkAccount`), `lib/emba/portal-session.ts`, `lib/emba/in-a-group.ts`.
- `lib/emba/team-waiting.ts` (`onYou`, `teamOnYou`), `lib/emba/team-core.ts`, `lib/emba/team-asks.ts`, `lib/campus/on-you.ts`, `app/c/on-you.tsx`.
- `lib/campus/screen.ts` (the viewer part becomes its own read), `app/groups/layout.tsx` (`accountScreen`, `looks`), `app/groups/bar.tsx`, `app/c/site-bar.tsx`, `components/campus/screen.tsx` (`Account`).
- `app/groups/connections/page.tsx`, `lib/emba/consent.ts`.
- Tests: `lib/__tests__/emba-clerk-identity.test.ts`, `emba-waiting.test.ts`, `emba-team-speed.test.ts`, `app/c/on-you.test.tsx`, `app/groups/group-tree-pages.test.tsx`, `emba-memory.test.ts`, `emba-team-read.test.ts`.
- No migration, no new dependency, no change to what any page shows.

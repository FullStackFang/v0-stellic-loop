## 1. Identify a known account in one statement (D1)

- [x] 1.1 Read `getClerkPortalPrincipal`, `enrolClerkAccount`, `authenticate` and `nameIfUnnamed`; write down the statements a known account makes today and confirm none of them writes
  - Found: `begin`, advisory lock, identity select, `person for update`, tombstone select, `nameIfUnnamed` update, `authenticate` select, `commit` (8), then `inAGroup` (9). The only write is `nameIfUnnamed`, and only while the name is the placeholder.
- [x] 1.2 Tests first in `lib/__tests__/emba-clerk-identity.test.ts`: a known account makes one statement and no transaction; a new account is enrolled as before; a revoked sign-in and a deleted person are refused; an unnamed person with a name at the provider still gets it
- [x] 1.3 Add the fast path; the principal is still made by `authenticate` (or a variant given the row), with no second statement
  - `authenticate` is handed a `Q` that answers with the row just read; the mark stays private to `access.ts`.
- [x] 1.4 Fold "belongs to any group" into that statement and use it in `getPortalPrincipal` in place of `inAGroup`
- [x] 1.5 Run the affected tests (`--maxWorkers=3`), `tsc --noEmit`, eslint on the changed files; commit by path

## 2. Counters: the page view's groups, one check per transaction (D2)

- [x] 2.1 Confirm that the four `canAccessLoop` calls in `teamOnYou` run in one transaction; any that runs in its own keeps its own check
  - All four run on `reading`'s one `q`. One is `authorize`'s `read` check (a different action, kept); the other three are the same `post` check, now made once.
- [x] 2.2 Tests first (`emba-waiting.test.ts`, `emba-team-speed.test.ts`, `app/c/on-you.test.tsx`): the site path does not list groups again; statements per group drop; a role revoked between two groups' reads refuses the second; the assistant path is unchanged
  - The new test is in `emba-waiting.test.ts`; the other two files pass unchanged.
- [x] 2.3 `onYou` takes the groups as an argument on the site path (`lib/campus/on-you.ts` passes `portalGroupTree`); the assistant path keeps `listGroups`
- [x] 2.4 Carry the access answer through `teamOnYou`'s readers as an argument, never as a module or request memo
- [x] 2.5 Run the affected tests, type check, lint; commit by path

## 3. The account card's own read (D3)

- [x] 3.1 List every field of `screen` that `Bar` and `Account` use; confirm it is `screen.viewer` and `screen.campus` alone
  - `Bar` and `Account` read `screen.viewer` only; `CampusBar` reads `screen.campus` and `screen.viewer`. So a `Screen` with empty lists (`barScreen`) touches no component.
- [x] 3.2 Extract `accountViewer` from the tail of `campusScreen`, reading in one wave; `campusScreen` calls it
  - Two waves: the person's rows, school, LinkedIn schools and campuses together, then the picker's animals (which need the schools).
- [x] 3.3 Use it in `app/groups/layout.tsx` (replacing `accountScreen` and `looks`, keeping the plain-card fallback) and in `app/c/site-bar.tsx`
- [x] 3.4 Tests: `app/groups/group-tree-pages.test.tsx` and the campus screen tests still pass; add one that the bar's read makes no listing query
  - Added in `lib/__tests__/campus-edges.test.ts` (`app/c/campus-screen.test.tsx` holds another session's work).
- [ ] 3.5 Open a groups page and the Ink page signed in and check the card against the week page's card; commit by path

## 4. The Assistants page (D4)

- [x] 4.1 One transaction for grants, removed-group grants and the clock in `lib/emba/consent.ts`, with one personal check and one `lease:list` record; tests in `emba-memory.test.ts` / `emba-team-read.test.ts`
  - `listGrants`; its test is in `emba-groups.test.ts`, beside the removed-group grants it covers. `listLeases` and `listRemovedGroupGrants` stay for their other callers and share the same statements.
- [x] 4.2 Start the page's reads together in `app/groups/connections/page.tsx`; a member without Ink+ still reads no grant
- [x] 4.3 Run the affected tests, type check, lint; commit by path

## 5. Proof

- [ ] 5.1 Take the laptop timings in design.md's Context again and write the new numbers there
- [ ] 5.2 Reload `/groups/extreme-cheapskates`, `/groups/connections` and `/c/ink` signed in; watch the dev server's log for errors
- [ ] 5.3 Push and open one pull request to `main` after the owner has tried it on localhost

## 6. Waiting for the owner (not part of this change until answered)

- [ ] 6.1 Ask: listing groups checks access once under lock (design.md, Open Question 1)
- [ ] 6.2 Ask: read records only for assistant reads (Open Question 2)
- [ ] 6.3 Ask: remember the Clerk session check for page views; time the Clerk calls in production first (Open Question 3)
- [ ] 6.4 Ask: a development database near the laptop (Open Question 4)

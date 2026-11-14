## 1. First pass (built, in the working tree)

- [x] 1.1 Measure the baseline with `scripts/perf-probe.ts` (85ms a statement; team page about 230 statements, on a team with no records)
- [x] 1.2 Check sign-in and list groups once per page view (`getPortalPrincipal`, `portalGroupTree` in `lib/emba/portal-session.ts`)
- [x] 1.3 List groups in a fixed number of statements on the site (`canAccessLoops`, `leaseFor`, `currentAddresses`, `discover`), with a test that counts them
- [x] 1.4 Trim each team read's setup (`authorize` skips the repeated personal check; `reading` reads head, state and today in one statement)
- [x] 1.5 Start the team, members and resources pages' reads together; pool of 10
- [x] 1.6 `app/groups/[namespace]/loading.tsx`
- [x] 1.7 `regions: ["pdx1"]` in `vercel.json`
- [x] 1.8 Full suite, typecheck and lint green (729 passed, 2026-11-13)
- [x] 1.9 After review: `canAccessLoops` names a group by organization and id together; its comment says it holds more locks than the single check
- [x] 1.10 Test: `canAccessLoops` refuses a group id named under another organization (`emba-group-tree.test.ts`)
- [ ] 1.11 Founder, in the browser, signed in: a team page looks and behaves as before; one sign-in check per page view (1.2 has no automated test, because tests call pages outside a render); what a hover over the side menu's links prefetches
- [ ] 1.12 Founder: deploy, then confirm in Vercel that functions run in `pdx1`

## 2. Fewer statements per list (D1)

- [x] 2.1 Seed a team with records in every list, an announcement, asks with answers, and interest; give `perf-probe` that team and the `manage` check; record the counts here and set the budgets. Done as `test/team-seed.ts` and `perf-probe.ts --seeded` (the team is made inside the probe's transaction and rolled back with it). On the seeded team before D1, as the tests count (two fewer than on the wire): `teamState` 33, `teamBrief` 31, `listAsks` 27. Budgets, in `emba-team-speed.test.ts`: 18, 18, 17
- [x] 2.2 Capture today's answers of `teamState`, `teamBrief`, `whatsNew`, `listAsks`, `askResults` and `upcomingEvents` on that team (`lib/__tests__/captures/busy-team.json`: an owner, a member, a follower and an assistant)
- [x] 2.3 Statement-count tests that fail today: 1 and 20 records cost the same; 1 and 20 asks cost the same; budgets for `teamState`, `teamBrief`, `listAsks`
- [x] 2.4 Give answers, posting members, people and interest a stated order ending in the id; test it; capture again (this is the one allowed difference from 2.2). The capture changed only among people who are equal on screen: two former members' written answers, and for an assistant a member with no handle beside them
- [x] 2.5 `viewPeople` folds the namespace lookup; `viewMembers` takes names from it for the site only; test that an assistant never gets a name
- [x] 2.6 `viewRecords` in one statement (tags, flags, links, overlaps, event slugs as JSON columns); `viewAsks` in one statement (options and answers as JSON, posting members in a CTE); `interested()` likewise; count-only `openAsks` for `teamBrief`
- [x] 2.7 Compare with the capture from 2.4 on PGlite and once with `QB_DB=remote`; run `emba-team-read`, `emba-team-records`, `emba-club-asks`, `emba-club-events`, `emba-team-mcp`. PGlite: identical, and the five suites pass (64 tests). No `SUPABASE_TEST_DB_URL` is set on this machine, so the `pg` comparison was made by `perf-probe.ts --seeded` against the configured database: identical
- [x] 2.8 Run `perf-probe` and record the new counts and times here. Seeded team, as its owner, on the wire, 85ms a statement (2026-11-13): `teamState` 20 (1.7s; 35 before), `teamBrief` 20 (1.7s), `listAsks` 19 (1.8s; 29 before), `upcomingEvents` 13 (1.1s), `myRecentRecords` 12 (1.0s), `listTeamEvents` 11, archived 10, `briefHistory` 9, a `manage` or `post` check 6

## 3. Read only what is shown (D2)

- [x] 3.1 Test: on the decisions tab the page makes no call to `listAsks`, `briefHistory`, `myRecentRecords`, `upcomingEvents` or archived events
- [x] 3.2 Split the team page's `load` into the header's reads and one loader per tab, all started together; take the asks count from `brief.asks.open`
- [x] 3.3 Replace "history was refused" with a direct `manage` check; move the `post` check to the events and asks tabs; test a member, an organizer and a follower
- [x] 3.4 The connections page takes its groups from `portalGroupTree`
- [x] 3.5 Give the pool a connection timeout, so an exhausted pool fails instead of waiting without limit (10 seconds)
- [x] 3.6 `app/groups/team-page.test.tsx` green for every tab

## 4. Close

- [x] 4.1 Full suite with `--maxWorkers=3`, `tsc --noEmit`, lint (738 passed, 30 skipped, 2026-11-13; typecheck clean; lint clean for the repository's files, and `npx eslint` with no path also reports 16 errors in gitignored scratch scripts under `.playwright-mcp/`)
- [x] 4.2 One production build, with no dev server running (`npm run build` passed on 2026-11-13, after section 5, with port 3000 free)
- [x] 4.3 Record the final counts here, and put the open question about the deferred items to the founder. On the seeded team, as its owner, on the wire: the default tab now makes four reads (`teamState` 20, `teamBrief` 20, `listTeamEvents` 11, the `manage` check 6: 57 statements) where it made nine (about 155); the slowest path is 7 + 18 + 20 = 45 statements in a row, about 3.8 seconds at 85ms, where it was 60. The question was put to the founder on 2026-11-13

## 5. Reads start beside the group listing (founder's go-ahead, 2026-11-13)

- [x] 5.1 `addressedScope` (`lib/emba/groups.ts`) finds the group an address names in one statement, with no access check; `openGroup` (`lib/emba/portal-session.ts`) starts the page's reads on it beside the listing of groups, and drops what they returned unless the listing holds that group
- [x] 5.2 The team, members and resources pages use `openGroup`. Page tests green (34 tests, including an outsider shown "Group unavailable")
- [ ] 5.3 Founder, in the browser: time a team page. By count the slowest path is now 7 + 1 + 20 = 28 statements in a row, about 2.4 seconds at 85ms, where it was 45; this has not been measured signed in


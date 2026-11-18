## 1. Database

- [ ] 1.1 Write `supabase/migrations/20261116100000_emba_group_placement.sql`: table `emba_group_placement` (design D1) and functions `emba_group_above` and `emba_group_below` (D3)
- [ ] 1.2 Add the migration to the test database setup; test both functions on built-in nesting, placed nesting, a mix of the two, and the depth stop

## 2. One definition of the hierarchy

- [ ] 2.1 Before touching any walk: run the existing access, group-tree, tags, invitations, roles and team suites and record them green
- [ ] 2.2 Replace the walks in `lib/emba/access.ts` (`canAccessLoop`, `canAccessLoops`) with `emba_group_above`, carrying each ancestor's own organization into the role and membership joins and keeping the lock order
- [ ] 2.3 Replace the downward walks in `groups.ts` (`discover`), `roles.ts` and `team-read.ts` with `emba_group_below`
- [ ] 2.4 Replace the remaining upward walks in `groups.ts`, `roles.ts`, `invitations.ts`, `access-requests.ts`, `activities.ts`, `group-tree.ts`, `team-core.ts`, `team-records.ts`
- [ ] 2.5 Guard test: no recursive walk over `parent_id` remains in `lib/emba` outside the two functions
- [ ] 2.6 The suites from 2.1 pass unchanged

## 3. Placement

- [ ] 3.1 Tests first (`lib/__tests__/emba-group-placement.test.ts`): place, move, take out; refused for a member, for a non-organizer of the destination, for an assistant, for a built-in inner group, for a loop, for depth over 8; the outer group's organizer takes it out
- [ ] 3.2 Access matrix test: outer member, outer organizer, direct member, sibling-only person and outsider against a placed group, on every read and write entry point (page reads, record writes, asks, events, tags, roster, sends), while placed, after moving to another group, and after taking out
- [ ] 3.3 Tests: upward privacy (class-only person: listing, crumbs, tag suggestions, tag resolution name nothing above); handles and grants unchanged; no grant by inheritance; a dead grant is refused; inherited people tagged by their outer handle
- [ ] 3.4 `placeGroup` in `lib/emba/group-tree.ts`: first party only, authority per D5, lock, cycle and depth checks per D7, upsert or delete, audit
- [ ] 3.5 `previewMove`: counts of people who gain and lose access (D6), with tests
- [ ] 3.6 `listGroupTree`: place read in the existing second statement, `canMove`, `canStart` through the function (D10)
- [ ] 3.7 Concurrency test beside `emba-postgres-concurrency.test.ts`: an access check racing a move sees one chain or the other, never a mix
- [ ] 3.8 Statement-count test for the listing beside the page-speed tests; run `scripts/perf-probe.ts` before and after and record both

## 4. Site

- [ ] 4.1 Server actions `previewGroupMove` and `moveGroup` in `app/groups/`, revalidating `/groups`, answering in plain words when refused
- [ ] 4.2 Collapse store: closed ids in `localStorage`, read with `useSyncExternalStore`
- [ ] 4.3 Groups page list as a client tree: collapse toggles, closed children not rendered, drag and drop with a "Top level" strip, confirmation with the counts, optimistic move with undo on refusal, "Move to" menu (D11, D12)
- [ ] 4.4 Rail: collapse toggles on the same store, current group's path always open
- [ ] 4.5 Styles in `app/groups/groups.css` in the existing look: toggle, drag handle, drop highlight, menu, confirmation
- [ ] 4.6 Page tests: movable rows offer drag and "Move to", others do not; a closed group hides its children; the confirmation shows the counts; a refused move restores the row

## 5. Verify and ship

- [ ] 5.1 `tsc --noEmit` and the full suite green (`--maxWorkers=3`)
- [ ] 5.2 Drive it in a browser against a hosted test database as two people: organizer drags a class into a team and out; a team-only member gains and loses the class; collapse survives reload; screenshots
- [ ] 5.3 One production build at the end
- [ ] 5.4 Founder: apply the migration by hand on `supabase-loop`, and confirm, before any deploy
- [ ] 5.5 Deploy
- [ ] 5.6 Founder: run the one-off statement that revokes the grants left live on retired groups (design Migration Plan 3). Nothing is restored.

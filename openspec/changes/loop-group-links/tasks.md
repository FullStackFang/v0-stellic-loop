## 1. Database

- [ ] 1.1 Write `supabase/migrations/20261116100000_emba_group_placement.sql`: table `emba_group_placement` (design D1) with both foreign keys to `emba_loop` on delete cascade, a check that a group is not placed in itself, and an index on the parent pair
- [ ] 1.2 Add the table to the test database setup so the suite runs with it

## 2. Server

- [ ] 2.1 Tests first (`lib/__tests__/emba-group-placement.test.ts`): place, move, take out; refused for a member, for a non-organizer of the destination, for an assistant, for a built-in inner group, for a loop, for depth over 8; the outer group's organizer can take out
- [ ] 2.2 Tests: placement changes no handle, role, grant or access (outer member still refused on the placed group; tags resolve the same)
- [ ] 2.3 `placeGroup(db, principal, { orgId, loopId, parent | null })` in `lib/emba/group-tree.ts`: first party only, authority per D4, lock and cycle walk per D5, upsert or delete, audit
- [ ] 2.4 `listGroupTree`: read the place in the existing second statement (D6), add `canMove` per group, and test that a person who cannot open the outer group gets the placed group at the top with no trace of it
- [ ] 2.5 Missing-table tolerance (D7), with a test that drops the table and lists groups
- [ ] 2.6 Statement-count test for the listing, beside the existing page-speed tests

## 3. Site

- [ ] 3.1 Server action `moveGroup` in `app/groups/` calling `placeGroup`, revalidating `/groups`, answering in plain words when refused or not available
- [ ] 3.2 Collapse store: closed ids in `localStorage`, read with `useSyncExternalStore`
- [ ] 3.3 Groups page list as a client tree: collapse toggles, closed children not rendered, drag and drop with a "Top level" strip, optimistic move with undo on refusal, "Move to" menu (design D8, D9)
- [ ] 3.4 Rail: collapse toggles on the same store, current group's path always open
- [ ] 3.5 Styles in `app/groups/groups.css` in the existing look: toggle, drag handle, drop highlight, menu
- [ ] 3.6 Page tests: movable rows offer drag and "Move to", others do not; a closed group hides its children; a refused move restores the row

## 4. Verify and ship

- [ ] 4.1 `tsc --noEmit`, the new tests, and the group page tests green
- [ ] 4.2 Drive it in a browser against a hosted test database: drag in, drag out, "Move to" by keyboard, collapse survives reload, screenshots
- [ ] 4.3 One production build at the end
- [ ] 4.4 Founder: apply the migration by hand on `supabase-loop`
- [ ] 4.5 Data step as the owner (design Migration Plan 3): restore `@nbae-6561` and `@nbae-6830`, place both inside `@team-1`, retire the built-in copies inside Team 1; confirm through the connector

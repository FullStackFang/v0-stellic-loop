## Context

Nesting today is structural. An inner group is an `emba_loop` row with `parent_id` set, inside the same `emba_organization` as its root. It shares the root's namespace (`@namespace/slug`). A role on an outer group reaches every group inside it: `canAccessLoop` walks `parent_id` upward and looks for a live `emba_role` joined to a live `emba_membership` of the same organization. Every record table is keyed by `org_id`, so a built-in group cannot move to another root without rewriting its records.

That walk is not in one place. About 25 recursive statements in 10 files repeat it (upward for "may this person", downward for "which groups can this person open"), each scoped to one organization with `where l.org_id=$1`.

Founder's direction, 2026-11-16: nesting is "a reparent, or at least just an association"; a class can be moved out of Team 1 when it is done; a nested group stays taggable on its own handle; and access works "similar to how Google Drive does things, just emulate it": moved into a folder, the top level manages the access.

The Drive rules being copied: an item has its own direct permissions and inherits its folder's. Moving it drops what it inherited from the old folder, keeps its direct permissions, and adds the new folder's. A person's access is the stronger of direct and inherited. Sharing an item does not reveal or open its folder. Moving needs edit rights on the item and the right to add to the destination, and Drive warns when a move changes who has access.

## Goals / Non-Goals

**Goals:**
- A top-level group can be placed in another group, moved and taken out with one small write and no record rewritten.
- Access inherits downward through a place exactly as it does through built-in nesting, across top-level groups, and stops when the place is removed.
- One definition of "above" and "below" that every access check uses.
- No extra statement per page view; no new client dependency; the tree collapses.

**Non-Goals:**
- Moving a built-in inner group. It stays where it was built.
- Changing the start form (Open Questions 2).
- Restricting an inherited role downward ("limited access" folders in Drive). Inherited access cannot be reduced on the inner group.
- Granting assistants access through a place. A grant stays one assistant, one group.
- Placing from an assistant.
- A group in more than one place (Drive shortcuts).

## Decisions

**D1. A placement table, not `parent_id`.** `emba_group_placement(org_id, loop_id, parent_org_id, parent_loop_id, placed_by, placed_at)`, primary key `(org_id, loop_id)`, both pairs referencing `emba_loop` with cascade, check that the two differ, index on the parent pair. A row means "this root sits inside that group". `parent_id` cannot carry this: its foreign key confines it to one organization, and the placed group must keep its own organization because its namespace, members and every record hang on it. Rewriting `org_id` across all record tables to make a true reparent was rejected as slow, risky and irreversible in practice.

**D2. Only roots are placed, at most once.** The write refuses a group whose `parent_id` is set. One place keeps the tree a tree.

**D3. Two SQL functions define the hierarchy.** `emba_group_above(org uuid, loop uuid)` returns `(org_id, id, depth)` for the group and every group above it, following `parent_id` inside an organization and the placement row at each root. `emba_group_below(org uuid, loop uuid)` returns the group and everything under it the same way. Both are `stable`, `security invoker`, recursive, and stop at depth 16. Every existing walk is replaced by a call to one of them, carrying each ancestor's own `org_id` into the `emba_role` and `emba_membership` joins, as `canAccessLoops` already does. Alternatives rejected: editing each of the 25 walks by hand (one missed walk is an access hole or a hidden group, and the next walk written would repeat the mistake); a materialised closure table (faster reads, but a second copy of the truth to keep right on every move, for trees that are at most a few levels deep).

**D4. Roles are read where they are held.** Nothing is copied when a group is placed. A member of Team 1 is in a placed class because the walk from the class reaches Team 1, where their role and their Team 1 membership row live. Removing the placement removes the access in the same commit, with nothing to clean up. A person's role in a group is the strongest of their direct role and the roles they hold above, as today.

**D5. Who may move.** Placing or moving needs `manage` (owner or organizer) on the group and on the destination, both evaluated through D3, so an organizer of a group above either one qualifies. Taking out needs `manage` on the group; because access inherits, the outer group's organizers have it. Site only (`requireFirstParty`). This is Drive's rule: edit rights on the item, add rights on the destination.

**D6. A move says what it changes before it is saved.** A preview read returns how many people gain access and how many lose it (people in the old outer chain with no direct role on the group and no role in the new chain). The drop and the "Move to" menu show it and ask once: "12 people in Team 1 will be able to open NBAE 6561. 3 people will lose it." A move that changes nobody's access saves without asking.

**D7. No cycles; the move and the checks cannot interleave.** In one serializable transaction the write takes `for no key update` on the moved group's `emba_loop` row, re-checks D5, and refuses when the destination appears in `emba_group_below(group)` or the chain above the destination is deeper than 8. Access checks already take `for share` on every `emba_loop` row in the chain they walk, so a check that started before a move commits either sees the old chain and holds it, or waits. The role-granting writes that today lock an organization's hierarchy lock through D3 as well.

**D8. What does not follow a place.**
- Assistant grants (`emba_lease`) are matched on the exact group, as now. A person who gains a class through Team 1 grants their assistant the class themselves. A person who loses the class keeps a dead grant: `authorize` checks access before the lease.
- Handles and namespaces. The placed group is `@nbae-6561`; its events and member handles stay in its namespace. A person who is in it through Team 1 is shown and tagged by the handle they hold in Team 1 (`@team-1/priya`), since a member handle belongs to a membership.
- Join links and invitations stay on the group they were made for and give a direct role on it.
- Email and calendar sends for a group go to everyone who can open it, through D3, so they follow a place.

**D9. Upward privacy is unchanged and now crosses top-level groups.** A person with a role only on the placed group cannot open the outer group. The listing already drops a parent the person cannot open (`open.has(parentId)`), so the placed group hangs at their top and crumbs stop there. Tag suggestions, tag resolution and rosters are computed through D3 from the viewer's side, so they show only people in groups the viewer can open.

**D10. The listing reads the place in a statement it already runs.** `discover` finds accessible groups through `emba_group_below`; the second statement of `listGroupTree` returns `coalesce(l.parent_id, p.parent_loop_id)` as the parent and a `canMove` flag. Statement count per page view does not change. `canStart` is evaluated through `emba_group_above`.

**D11. Client: native drag and drop, optimistic, plus a menu.** The Groups list becomes one client component fed the tree the page already loaded. Movable rows are `draggable`; rows and a "Top level" strip the person may drop on take the drop. The preview (D6) is fetched on drop; once confirmed, `useOptimistic` re-parents the row and one server action writes it and revalidates `/groups`. A refusal puts the row back with a message. Each movable row also has a "Move to" menu listing allowed destinations, for touch and keyboard, which HTML drag and drop does not serve. A drag library was rejected: one kind of drop target, at most 300 rows.

**D12. Collapse is client state.** A toggle on each row with groups under it; closed ids kept in `localStorage` under one key, read with `useSyncExternalStore` (server snapshot: all open). No server cost. Closed rows' children are not rendered. The rail uses the same store and always opens the path to the current group.

## Risks / Trade-offs

- [A walk is missed in the refactor and a group is open to too many or too few people] → D3 leaves no walk in application code: a test greps `lib/emba` for `parent_id` outside the migration-backed helpers and the insert in `createInnerGroup`. A matrix test runs every read and write entry point for outer member, outer organizer, direct member, sibling-only and outsider against a placed group, before and after taking it out. The existing access suites must pass unchanged, which proves built-in nesting behaves as before.
- [Dropping a group on the wrong place opens it to many people] → D6 confirmation naming the count; the move is undone by moving it back, and both are audited.
- [People who lose access had the content delivered to an assistant already] → Same as revoking a grant today; the confirmation says access ends from now.
- [Functions make every access check slower] → The function does the same recursive walk the inline statements do, plus one primary-key lookup per root. The page-speed tests hold the statement count; a timing probe (`scripts/perf-probe.ts`) is run before and after.
- [Two kinds of nesting on screen: built-in groups that cannot move and placed groups that can] → Built-in rows have no drag handle. The data step leaves Team 1 with placed classes only.
- [Code deployed before the migration] → Every group page would fail on the missing functions. The order is fixed in the Migration Plan and the deploy task is blocked on the founder's confirmation.

## Migration Plan

1. Founder applies `supabase/migrations/20261116100000_emba_group_placement.sql` by hand on `supabase-loop`. It only adds a table and two functions, so the running code is unaffected.
2. Deploy the code.
3. No data step. The founder decided on 2026-11-16 not to restore `@nbae-6561` and `@nbae-6830`: they stay retired, the classes built into `@team-1` stay as they are, and the assistant grants left live on the two retired groups are revoked by a one-off statement the founder runs by hand. Removing a group now revokes its grants.
4. Rollback: redeploy the previous build, then drop the functions and the table. Every placed group returns to the top level, open to its direct members only.

## Open Questions

1. **Nothing is placed after deploy.** With no restore, the live data has no top-level class to place inside Team 1, so placement is first seen when someone moves a group.
2. **Start form.** "Where it lives" still builds inner groups with `@outer/slug` handles, the model the founder called redundant. Switching it to "own group, then placed" needs a rule for who may create a top-level group, which today is pilot owners only. Left for a follow-up; my call.
3. **Should a move ever skip the confirmation?** It is skipped only when nobody's access changes. My call.
4. **Restoring a retired group** has no control on the site, and none is planned: the founder does not want removed groups restored.

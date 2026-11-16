## Context

Today nesting is structural. An inner group is an `emba_loop` row with `parent_id` set, in the same `emba_organization` as its root. It shares the root's namespace (`@namespace/slug`), and a role on an outer group reaches every group inside it (`canAccessLoop` walks `parent_id`). Every record table is keyed by `org_id`, so a structural group cannot move to another root without rewriting its records, members, grants and handle.

The founder's direction (2026-11-16): nesting is "a reparent, or at least just an association"; a class can be moved out of Team 1 when it is done; a nested group stays taggable on its own; `@team-1/nbae-…` is redundant.

`listGroupTree` already reads every group a person can open and each one's parent in two statements per page view (`portalGroupTree` caches it per request). `treeOrder`, `pathTo` and `placeGroup` in `lib/emba/group-path.ts` build the tree, crumbs and "Inside this group" from `parentLoopId` alone.

## Goals / Non-Goals

**Goals:**
- A top-level group can be shown inside another group and moved or taken out, with one small write.
- A placement changes nothing but where the group is shown.
- No extra statement per page view, and no new client dependency.
- The tree can be collapsed.

**Non-Goals:**
- Moving a built-in inner group (`parent_id` set). It stays where it was built.
- Changing the start form. "Where it lives" keeps building inner groups; see Open Questions.
- Giving access through placement. Members of the outer group do not gain the placed group.
- Placing from an assistant. A tool for managing groups from an assistant is a separate change.
- A per-person arrangement. The arrangement is shared.

## Decisions

**D1. A separate table, not `parent_id`.** `emba_group_placement(org_id, loop_id, parent_org_id, parent_loop_id, placed_by, placed_at)`, primary key `(org_id, loop_id)`, both pairs referencing `emba_loop`, deleted with either group. A row means "this group is shown inside that one"; no row means top level. Reusing `parent_id` was rejected: it is confined to one organization by its foreign key, and every access check walks it, so a move would silently change who can open a group.

**D2. Only roots are placed, and a root has at most one place.** The write refuses a group whose `parent_id` is set. One parent keeps the tree a tree, so crumbs and the rail stay unambiguous. A group shown in several places was rejected as more than was asked for.

**D3. Placement never feeds an access check.** `canAccessLoop`, the listing's membership filter, tags and assistant consent do not read the table. This is what makes "nothing else changes" true and keeps the change away from the security-critical paths.

**D4. Who may place.** Placing or moving needs owner or organizer on the group and on the destination (the listing's existing `canStart` predicate, checked again inside the write). Taking out needs it on either the group or the place it sits in, so the outer group's organizers can clear what was hung on it. Site only (`requireFirstParty`).

**D5. No cycles, bounded depth.** In the same transaction, under a lock on the group's placement key, the write walks up from the destination through both `parent_id` and placements; if it meets the group being placed, or the chain exceeds 8, it refuses. The walk is one recursive statement.

**D6. The listing reads placements in the statement it already runs.** The second statement of `listGroupTree` gains `left join emba_group_placement` and returns `coalesce(l.parent_id, p.parent_loop_id)` as the parent. Statement count per page view is unchanged, and the join is on the table's primary key. The existing rule already hides a parent the person cannot open (`open.has(parentId)`), so a placed group hangs at the top for them and the outer group is never named.

**D7. A database without the table still serves pages.** The migration is applied by hand, so code can reach production first. The listing checks `to_regclass('emba_group_placement')` once per process and leaves the join out while it is absent; the write answers "not available yet".

**D8. Client: native drag and drop, optimistic, plus a menu.** The Groups list becomes one client component fed the tree the page already loaded. Rows a person may move are `draggable`; rows and a "Top level" strip they may drop on take `dragover`/`drop`. `useOptimistic` re-parents the row at once and one server action writes it and revalidates `/groups`; a refusal puts the row back with a message. HTML drag and drop does not fire on touch and is not keyboard reachable, so each movable row also has a "Move to" menu listing the allowed destinations, which calls the same action. A drag library was rejected: the interaction is one drop target type and the list is at most 300 rows.

**D9. Collapse is client state.** A toggle on each row that has groups under it; closed ids are kept in `localStorage` under one key and read with `useSyncExternalStore` (server snapshot: all open), so there is no server cost and no layout jump on later visits beyond the first paint. Default is open. Closed rows' children are not rendered. The rail uses the same store, and always shows the path to the current group.

## Risks / Trade-offs

- [Two kinds of nesting are visible at once: built-in inner groups that cannot move, and placed groups that can] → Built-in rows have no drag handle and no "Move to"; the data step after deploy leaves Team 1 with placed classes only. The start form is the remaining source of built-in groups (Open Questions).
- [People expect a group under "Team 1" to be open to Team 1's members] → The drop confirmation and the "Move to" menu say "Only people already in NBAE 6561 can open it". Open Questions asks whether that is what the founder wants.
- [First paint shows everything open before stored collapse state applies] → Accepted; reading `localStorage` on the server is not possible, and a cookie would add weight to every request.
- [Concurrent moves of the same group] → The lock in D5 serializes them; the last write wins and both pages revalidate.

## Migration Plan

1. Ship code. Without the table the site behaves as today (D7).
2. Founder applies `supabase/migrations/20261116100000_emba_group_placement.sql` by hand on `supabase-loop`.
3. Data step, run as the owner through the services: clear `retired_at` on `@nbae-6561` and `@nbae-6830`, place both inside `@team-1`, retire `@team-1/nbae-6561` and `@team-1/nbae-6830`. Assistant grants on the two restored groups from 2026-11-16 are still live.
4. Rollback: drop the table; every group returns to the top level and nothing else is affected.

## Open Questions

1. **Access.** Placement gives no access (D3). Should placing a group offer "also invite everyone in Team 1"? Left out; my call, not confirmed.
2. **Start form.** "Where it lives" still builds inner groups with `@outer/slug` handles and shared members, which is the model the founder called redundant. Switching it to "own group, then placed" needs a rule for who may create a top-level group, which today is pilot owners only. Left for a follow-up.
3. **Default.** Tree opens expanded the first time; collapse is remembered. My call.
4. **Restoring a retired group** has no button on the site; step 3 does it by script. A "bring back" control is not in this change.

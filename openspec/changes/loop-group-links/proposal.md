## Why

A group can only sit inside another by being built there: it takes the outer group's namespace (`@team-1/nbae-6561`), shares its members, and can never move. The founder wants nesting to be an association instead: a class sits under "Team 1" while it matters, moves out when it is done, and is tagged by its own handle (`@nbae-6561`) the whole time. The groups list is also always fully expanded, which does not hold up as the number of groups grows.

## What Changes

- A top-level group can be **placed** inside another group, and taken out again. Placement is one stored association. It changes where the group is shown and nothing else: not its handle, its links, its members, its assistant grants, or who can open it.
- Placing is done on the Groups page by dragging a group onto another, or onto "Top level", and by a "Move to" menu on each row for touch and keyboard.
- Only a person who is an owner or organizer of both the group and the place it goes may place it. An owner or organizer of either one may take it out.
- Everyone sees the same arrangement. A person who cannot open the outer group sees the placed group at the top, and is never told what it sits inside.
- Groups with groups under them can be collapsed and expanded on the Groups page and in the rail. The choice is remembered in the browser.
- Groups built inside another group (existing inner groups such as `@team-1/nbae-6561`) keep working exactly as they do now and cannot be dragged. The start form is unchanged.

## Capabilities

### New Capabilities
- `group-placement`: placing a top-level group inside another group as an association, moving it and taking it out, who may do so, what placement does not change, how placed groups appear in the tree, and collapsing the tree.

### Modified Capabilities

None. The requirements of `group-tree` hold as written: its tree, crumbs and "Inside this group" list gain placed groups through the new capability, and its rules for built-in inner groups do not change.

## Impact

- **Database**: one new table, `emba_group_placement`, in a migration the founder applies by hand on `supabase-loop`. Pages must keep working on a database that does not have it yet.
- **Server**: `lib/emba/group-tree.ts` (the listing reads placements in the statement it already runs; a new `placeGroup` write), a server action in `app/groups/`.
- **Site**: `app/groups/page.tsx` (list becomes a small client tree with collapse, drag and "Move to"), `app/groups/rail.tsx` (collapse), `app/groups/groups.css`. No new dependency.
- **Assistants**: no change. Handles, tags and tool results are the same before and after a placement; placing is site only.
- **Data, after deploy**: the two top-level class groups retired on 2026-11-16 are restored and placed inside Team 1, and the built-in copies inside Team 1 are retired, so each class exists once under its own handle.

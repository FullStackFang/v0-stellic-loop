> **Shelved 2026-11-16, not approved.** The founder chose to keep groups as they are built (a group inside a group, access inherited downward) rather than make structure freely movable: "if it's too annoying to change the structure of the groups freely then let's not... I don't want it to be overcomplicated." Kept for reference if moving a group between top-level groups becomes a real need.

## Why

A group can only sit inside another by being built there: it takes the outer group's namespace (`@team-1/nbae-6561`) and can never move. The founder wants groups to behave like folders in Google Drive: a class sits under "Team 1" while it matters and moves out when it is done; while it is inside, Team 1's people can open it and Team 1's organizers run it; it is tagged by its own handle (`@nbae-6561`) the whole time. The groups list is also always fully expanded, which does not hold up as the number of groups grows.

## What Changes

- A top-level group can be **placed** inside another group, moved to a different one, and taken out again. A placement is one stored association between two groups; no record is rewritten.
- **Access follows the place, as in Google Drive.** While a group is placed, everyone who can open the outer group can open it, with the role they hold above, in addition to the people who hold a role on the group itself. Taken out, it is open only to the people who hold a role on it directly. Moving it from one outer group to another swaps the inherited people and keeps the direct ones.
- **Access never flows upward.** A person who holds a role only on the placed group cannot open, and is not told about, the group it sits in.
- A placed group keeps its own handle, page address, share and join links, record and files. `@nbae-6561` works before, during and after.
- Before a move is saved the site says who gains and who loses access.
- Placing needs an owner or organizer of both the group and the destination. Taking out needs an owner or organizer of the group, which includes the outer group's organizers once it is placed.
- Moving is done on the Groups page by dragging a group onto another or onto "Top level", and by a "Move to" menu on each row for touch and keyboard.
- Groups with groups under them can be collapsed and expanded on the Groups page and in the rail. The choice is remembered in the browser.
- An assistant grant still covers one group. Gaining a group through its place does not give a person's assistant access to it until they grant it.
- Groups built inside another group (`@team-1/nbae-6561`) keep working as they do now and cannot be moved. The start form is unchanged.

## Capabilities

### New Capabilities
- `group-placement`: placing a top-level group inside another group, moving it and taking it out; how access is inherited through a place and removed with it; who may move a group; what a move does not change; moving on the Groups page; collapsing the tree.

### Modified Capabilities
- `group-tree`: "Who is in an inner group" and "An inner-only person learns nothing about groups above" extend from built-in inner groups to placed groups, whose outer group may be a different top-level group.

## Impact

- **Database**: one migration, applied by the founder by hand on `supabase-loop` **before** the code is deployed: table `emba_group_placement` and two functions that return the groups above and below a group across both kinds of nesting.
- **Access checks**: about 25 hand-written hierarchy walks in 10 files (`access.ts`, `groups.ts`, `roles.ts`, `invitations.ts`, `access-requests.ts`, `activities.ts`, `group-tree.ts`, `team-core.ts`, `team-read.ts`, `team-records.ts`) move to the two functions. This is the security-critical part of the change.
- **Server**: a `placeGroup` write and a move preview in `lib/emba/group-tree.ts`; a server action in `app/groups/`.
- **Site**: `app/groups/page.tsx` (client tree with collapse, drag and "Move to"), `app/groups/rail.tsx`, `app/groups/groups.css`. No new dependency.
- **Assistants**: handles, tags and tool shapes are unchanged. What a person's assistant can reach changes only through the person's own access and grants.
- **Data, after deploy**: none. The two top-level class groups retired on 2026-11-16 stay retired (founder, 2026-11-16), and the classes built into Team 1 stay as they are.

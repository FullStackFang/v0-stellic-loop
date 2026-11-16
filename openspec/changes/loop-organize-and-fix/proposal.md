## Why

Setting up Team 1 with two classes on 2026-11-16 took a script, three manual grants per assistant and a retired pair of duplicate groups, because an organizer has no way to correct a mistake: a group cannot be renamed, archived from the site or brought back, and nothing about groups or people can be done from chat. The founder wants members to manage nothing themselves, organizers to do their organizing through their assistant, and a simple way to fix mistakes, without making access complicated.

## What Changes

- **One grant covers a team.** A grant an assistant holds on a group also covers every group built inside it, now and later. Granting "Team 1" once reaches its classes. Revoking it ends all of them.
- **Fixing mistakes, for owners and organizers:**
  - **Rename** a group. Its handle does not change.
  - **Archive** a group, with the groups inside it, and **restore** it. Nothing is deleted. A group in the wrong place is fixed by archiving it and starting it again where it belongs.
- **Organizing from chat.** Two new tools for an owner or organizer whose assistant has a read-and-write grant: one for groups (start a group inside one, rename, archive) and one for people (invite by email as members). Restoring, removing a person and changing who is an owner or organizer stay on the site.
- **Groups page.** Groups with groups under them collapse and expand, remembered in the browser. Each group an organizer runs gets a menu: Rename, Archive. Archived groups are listed below with Restore.
- **Assistants page.** Says that a grant covers the groups inside, and that read-and-write now includes organizing.
- Not in this change: moving a group (see design, Decision D1), drag and drop, and any change to who is in a group or who may remove people.

## Capabilities

### New Capabilities
- `group-organizing`: renaming, archiving and restoring a group; who may; the Groups page menu, archived list and collapsing.
- `organizer-chat-tools`: the two assistant tools for organizing groups and inviting people, what they may and may not do, and the limits on them.
- `team-wide-grants`: an assistant grant on a group covers the groups built inside it.

### Modified Capabilities
- `group-tree`: "Who may start a group inside a group" no longer forbids starting one through an assistant.

## Impact

- **Database**: one small migration, applied by the founder by hand on `supabase-loop` before deploy. It replaces the trigger function `emba_guard_group_address`, which today refuses to clear `retired_at`, so that a group can be restored. No new table or column.
- **Consent**: `leaseFor` (`lib/emba/consent.ts`), the lease filter in `discover` (`lib/emba/groups.ts`) and the lease match in `lib/emba/group-actions.ts` accept a grant on the group or on a group above it.
- **Services**: new `renameGroup`, `archiveGroup`, `restoreGroup` in `lib/emba/group-tree.ts`; `createInnerGroup` and `issueInvitation` (member role) accept an assistant with a read-and-write grant; `issueInvitation` gains an audit row; accepting an invitation to an archived group is refused.
- **Assistant layer**: `lib/emba/team-mcp.ts` gains `manage_group` and `invite_people`; formatting in `lib/emba/team-format.ts`.
- **Site**: `app/groups/page.tsx`, `app/groups/rail.tsx`, `app/groups/connections/page.tsx`, `app/groups/groups.css`, new server actions.
- **Seed script**: `scripts/emba-seed.ts --team` stops granting each class separately.

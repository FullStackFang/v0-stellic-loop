## Why

Starting a group today is a three-field form the founder called "terrible and boiler plate", and a group cannot hold another group on the site even though the database has had a group tree since the first migration. The founder's own case is a cohort (EMBA 2027) holding a study team (Team 1) holding a course (NBAE 6830). On November 13 the founder picked a form and a picker from clickable mockups and said to build them.

## What Changes

- Let a group hold groups, to any depth. Each inner group has its own name, handle, files, dates, asks and join link.
- Keep the access rule the database already has and say it plainly: everyone in a group can open the groups inside it. A person added only to an inner group cannot see the groups above it, or the people who are only in them.
- Show the tree: the rail lists a person's groups as a tree, each group page has crumbs that walk up, and each group lists the groups inside it with "Start a group here".
- Replace the start form with the picked design (`public/demo/mockups-new-group.html`, tab B): one slim header row for the name, the handle and where the group lives, then one box that takes dropped files, pasted links, a Drive folder link, email addresses and a note, and sorts them into lanes. Only the name is required.
- "Where it lives" opens a columns picker: one column per level, "Top level, on its own" first, a footer that says where the group goes and who can open it.
- After creating, show a "group is ready" page: the join link, how to connect an assistant, the first announcement, and a way into the new group.
- Let a group keep links (address and title only) from the start form.
- Let a group connect one Google Drive folder, read only. Loop lists what is in that folder as links. It never sees the rest of the Drive and keeps no copy of the files.
- Not in this change: moving a group to a different parent, renaming a handle, turning one top-level group into an inner group of another, deleting a group, Drive folders with write access, reading the text of Drive files, more than one Drive folder per group.

## Capabilities

### New Capabilities

- `group-tree`: groups inside groups, the name and handle of an inner group, who may start one, who can open it, what a person in an inner group can and cannot see above it, and the rail, crumbs and "Inside this group" list that show the tree.
- `group-start`: the start-a-group form, the columns picker, the lanes (files, links, people, first announcement), what happens to each on create, and the "group is ready" page.
- `group-drive-folder`: connecting one read-only Google Drive folder to a group, listing its files as links, and disconnecting it.

### Modified Capabilities

None of the capabilities in `openspec/specs/` change. The join link (`open-join` in `loop-club-events-and-asks`) and the team tools (`loop-team-layer`) live in unarchived changes; this change states what it adds to them as new requirements.

## Impact

Root Next.js application: `lib/emba/workspaces.ts`, `lib/emba/groups.ts`, `lib/emba/tags.ts`, `lib/emba/team-core.ts`, `lib/emba/access-requests.ts`, new `lib/emba/group-tree.ts` and `lib/emba/drive-folder.ts`, `app/groups/layout.tsx`, `app/groups/rail.tsx`, `app/groups/page.tsx`, the four pages under `app/groups/[namespace]`, new pages for an inner group and for starting a group, `app/groups/actions.ts`. One additive PostgreSQL migration, applied by hand on `supabase-loop`; the group pages need it before they load. The Drive folder needs a Google Cloud service account, set up by the founder; without it the Drive lane does not appear and everything else works. No new sign-in scope. Existing handles and links keep working.

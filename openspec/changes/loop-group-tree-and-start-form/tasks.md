## 1. Database

- [x] 1.1 Write the additive migration: `emba_loop.name`, `emba_loop.description` (null on roots, length checks), `emba_drive_folder` (one row per group, folder id, folder name, who connected it, when), row level security on and no grants, as the other emba tables
- [x] 1.2 Test that the migration applies on PGlite after all earlier ones and that existing rows are unchanged
- [ ] 1.3 Founder: apply the migration by hand on `supabase-loop` (the group pages need it before they load)

## 2. The tree

- [x] 2.1 Tests first: `createInnerGroup` makes the loop, the address and the owner role; refuses a member, an assistant, a taken slug, a reserved slug, a parent in another organization
- [x] 2.2 Write `lib/emba/group-tree.ts`: `createInnerGroup` and `listGroupTree` (every group the person can open with its parent, name and whether they may start a group inside it)
- [x] 2.3 Read a group's name as `coalesce(l.name, o.name)` in `discover`, `team-core`, `tags`, `access-requests`, the share pages and invitations; test that an inner group shows its own name in each

## 3. Access in a tree

- [x] 3.1 Three-person fixture (outer member, inner-only member, sibling-only member) and tests for every scenario under "Who is in an inner group" across records, events, asks, announcements, documents and the connector tools
- [x] 3.2 Test that `tags.ts` gives a person in an inner group only no people and no groups from above (it already lists people only to those who can open the root; no code change)
- [x] 3.3 Tests, then let a live member of one group join another by link or approved request without touching the roles they hold; a person the group is already open to has nothing to join; a person removed from the inner group or the whole group is not re-admitted by the link
- [x] 3.4 Tests, then let `access-requests.ts` turn on a join link and admit mode for an inner group; a person admitted there gets the member role on that group only
- [x] 3.5 Review every query that joins `emba_organization` or filters by `org_id` alone for what it shows an inner-only person; fix and test each finding, or record why it is safe

## 4. Pages for the tree

- [x] 4.1 Read the routing and layout guides in `node_modules/next/dist/docs/` for this Next version before adding routes
- [x] 4.2 Add `groupFromParams` and `groupHref`; replace the `slug === 'workspace'` filters in the four group pages; add the `/groups/[namespace]/in/[slug]` routes that reuse the same page modules
- [x] 4.3 Rail as a tree from `listGroupTree` (smallest change to `app/groups/layout.tsx`); page tests for an outer member and an inner-only person
- [x] 4.4 Crumbs on every group page, stopping at the highest group the viewer can open
- [x] 4.5 "Inside this group" list with "Start a group here" for a person who may start one
- [x] 4.6 Styles in one new block at the end of `app/loop.css`, compact headers, A3 HAI tokens only

## 5. The start form

- [x] 5.1 Tests first for the sorter (file, link, Drive folder address, email, plain text, junk) as a pure function shared by the client box and the server action
- [x] 5.2 `/groups/new` page: the header row (name, handle, where it lives) and the columns picker, from the tree data; `?in=<handle>` opens with a parent chosen
- [x] 5.3 The one box and its lanes as a client component; items removable; a too-large file is refused with the Resources hint
- [x] 5.4 Tests, then the `startGroup` action: create the group, then files, links, invitations, announcement, join link, each in its own step, returning what was added and what failed
- [x] 5.5 The "group is ready" page; the join link shown on that load only
- [x] 5.6 Remove the inline form on `/groups` and the `createGroup` action; point "Start your group" at `/groups/new`; update `groups-home.test.tsx`
- [x] 5.7 Browser pass at desktop and phone width against `public/demo/mockups-new-group.html`, with screenshots

## 6. Drive folder

- [x] 6.1 Check current Google documentation for service-account access to a shared folder and the `files.list` call; correct design D9 if it differs
- [x] 6.2 Tests against a stubbed `fetch`, then `lib/emba/drive-folder.ts`: the service-account token with `jose`, `connectDriveFolder`, `disconnectDriveFolder`, `listDriveFolder` (read-only scope, direct children only, short cache)
- [x] 6.3 Drive lane in the start form and the Drive section on Resources, both absent when the service account is not configured; the "everyone sees the file names" line
- [x] 6.4 Access tests: member sees the list, inner-only person sees nothing of the outer group's folder, outsider refused, member cannot connect or disconnect
- [ ] 6.5 Founder: create the Google Cloud service account with the Drive API on, add `LOOP_DRIVE_CLIENT_EMAIL` and `LOOP_DRIVE_PRIVATE_KEY` locally and on Vercel
- [ ] 6.6 Founder: connect a real folder and confirm the list, then unshare it and confirm the page says so

## 7. Finish

- [x] 7.1 `tsc --noEmit`, eslint on the touched folders, the full test suite with `--maxWorkers=3`
- [x] 7.2 Independent review of sections 2, 3 and 6 for any path that shows a group, a person or a file to someone who cannot open it; fix what it finds (fixed: Drive folder connects only for its sharer; "Leave group" on the top level only; admit link refuses a role revoked above; no path to assistants; tree lists up to 300 groups; smaller bugs. Left as designed and recorded in design.md Risks: outer members visible inside, name-taken oracle)
- [ ] 7.3 One production build, with no dev server running
- [ ] 7.4 Founder: build the EMBA 2027 › Team 1 › NBAE 6830 tree on the live site and walk it as an outer member and as an inner-only member

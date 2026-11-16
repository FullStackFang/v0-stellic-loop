## 1. Ground truth

- [x] 1.1 Run the existing access, consent, group-tree, groups, roles, invitations and team suites and record them green
- [x] 1.2 Confirm on the test database that renaming a group (`emba_loop.name`, `emba_organization.name`) is blocked by no trigger or constraint; record anything that does in design.md before going on

## 2. Team-wide grants

- [x] 2.1 Tests first: one grant on a team reaches the groups inside it and a group started later; not upward, not sideways; any covering grant that allows the action allows it; revoke and expiry end the reach; a grant does not outlive the person's access
- [x] 2.2 `leaseFor` accepts a live lease carrying the action on the group or a group above it, in one statement (design D6)
- [x] 2.3 The lease filter in `discover` and the lease match in `lib/emba/group-actions.ts` accept the same
- [x] 2.4 Statement-count check: an assistant call runs no more statements than before
- [x] 2.5 Assistants page: wording where a grant is given, covered groups on each grant's row, "What each level allows" rewritten to include organizing; page tests
- [x] 2.6 `scripts/emba-seed.ts --team` grants Team 1 only; update its test

## 3. Rename, archive, restore

- [x] 3.1 `renameGroup` in `lib/emba/group-tree.ts` with tests: inner and top-level, handle unchanged, member refused (D2)
- [x] 3.2 Migration `supabase/migrations/20261116100000_emba_group_restore.sql`: replace `emba_guard_group_address` to allow `retired_at` to be cleared and nothing else new; add it to the test database setup; update the assertion in `lib/__tests__/emba-groups.test.ts` (D5)
- [x] 3.3 Tests first for `archiveGroup` and `restoreGroup`: subtree archived in one act and restored together; a group archived earlier stays archived; restore refused under an archived parent; grants on archived groups ended and not brought back; a team grant covers a restored group; inner group by its organizer, top-level by its owner only; member refused
- [x] 3.4 `archiveGroup` and `restoreGroup` (D3, D4), audited
- [x] 3.5 Accepting an invitation to an archived group is refused, with a test
- [x] 3.6 Read of the archived groups a person may restore: one statement, run only for a person who runs a group; test that a person who may not restore a group is not shown it; statement-count test for the Groups page beside the page-speed tests

## 4. Chat tools

- [x] 4.1 Tests first for `organizerVia` and each opened service: accepts an assistant with a read-and-write grant and an organizer behind it; refuses a read grant, a member, any role other than member, role changes, removal, restore, and anything on a top-level group; the cap is counted on the top-level group and one call counts once (D8, D9)
- [x] 4.2 `organizerVia` helper; call it in `createInnerGroup`, `issueInvitation`, `renameGroup` and inner-group `archiveGroup`
- [x] 4.3 `issueInvitation`: audit row, typed errors
- [x] 4.4 `manage_group` and `invite_people` in `lib/emba/team-mcp.ts`, declared destructive, with answers in `lib/emba/team-format.ts`; tool tests for every scenario in `organizer-chat-tools`. The other session is editing these two files: coordinate before touching them

## 5. Site

- [x] 5.1 Read the server-action and client-component guides in `node_modules/next/dist/docs/` before writing any of this section
- [x] 5.2 Server actions for rename, archive and restore in `app/groups/`, answering in plain words when refused
- [x] 5.3 Collapse store and toggles on the Groups page and the rail, with no open-then-close on load; the rail gets each group's id and parent (D10)
- [x] 5.4 Row menu: Rename, and Archive with its confirmation naming the groups to be hidden; the owner fact added to the listing's existing second statement
- [x] 5.5 Archived section with Restore
- [x] 5.6 Styles in `app/groups/groups.css` in the existing look
- [x] 5.7 Page tests for 5.3 to 5.5, including that a member sees no menu and no archived list

## 6. Verify and ship

- [x] 6.1 `tsc --noEmit` and the full suite green (`--maxWorkers=3`)
- [ ] 6.2 Drive it in a browser against a hosted test database: collapse survives reload without a flash; rename, archive and restore from the menu; a member sees none of it; screenshots
- [ ] 6.3 Through the connector against the same database: one grant on a team reaches a class; start a group, rename it, invite two addresses, archive it
- [x] 6.4 One production build at the end
- [ ] 6.5 Founder: apply the migration from 3.2 by hand on `supabase-loop`, and confirm, before any deploy
- [ ] 6.6 Deploy; on the live site grant Team 1 once for one assistant and confirm it lists both classes

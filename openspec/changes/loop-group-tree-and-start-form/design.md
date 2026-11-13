## Context

What exists:

- `emba_loop` is a tree inside one `emba_organization`: `path` (`seg/seg/...`), `parent_id`, a foreign key that forces a child's path to extend its parent's. A "top-level group" is one organization with one root loop, made by `createWorkspace` (pilot owners only).
- Roles reach down. `canAccessLoop`, `discover`, `posts` and `canPost` all walk from a loop up to its ancestors, so a role on a group counts in every group inside it. Membership (`emba_membership`) is per organization.
- A group is addressed by `emba_group_address`: one row per loop, a single-segment `slug`, unique inside the organization's one namespace, immutable. A root reads `@namespace`; any other loop reads `@namespace/slug`. Event slugs and member handles share that namespace.
- Every team service (records, events, asks, announcements, documents, join link, invitations) takes `{orgId, loopId}` and so already works on an inner loop.
- Nothing creates an inner loop outside tests. A loop has no name of its own: every query reads `emba_organization.name`. The site lists and opens roots only (`slug === 'workspace'` in the layout and four pages). The join link refuses any loop that is not a root.
- No Google integration exists. `jose` is already a dependency.

The founder picked the form (B, one box), the columns picker and the tree navigation from `public/demo/mockups-new-group.html`. The look is A3 HAI in `app/loop.css`. The founder applies migrations by hand; a second session edits styling in `app/loop.css`, `app/groups/layout.tsx` and the sign-in pages at the same time.

## Goals / Non-Goals

**Goals:**

- Inner groups to any depth that a person can start, open and walk through on the site, with every existing team feature working inside them.
- The picked form and picker, built for real, creating a group and everything dropped into the box in one submit.
- One read-only Drive folder per group, limited to that folder by Google and not by Loop's own care.
- No path by which a person in an inner group learns about groups above it or the people who are only there.

**Non-Goals:**

- Moving, renaming, merging or deleting groups. Handles and paths stay immutable.
- Putting an existing top-level group under another. Top-level groups are separate organizations.
- Members with a role on an inner group only by default: the access rule is not changed, only stated and tested.
- Reading the contents of Drive files, write access, several folders per group.
- Changes to the connector's tools beyond what falls out of the handle rules (D2). Assistants do not get the Drive file list yet.
- Email. Inviting a person records an invitation they see when they sign in with that address; sending mail belongs to `loop-club-reach`.

## Decisions

### D1. An inner group is a child `emba_loop` with its own name

Add `emba_loop.name` and `emba_loop.description`, both null on roots. A group's name is `coalesce(l.name, o.name)` everywhere a name is read. One service, `createInnerGroup(db, p, {orgId, parentLoopId, name, description, slug})`, inserts the loop (path = parent path + `/` + slug), an owner role for the creator on the new loop, and its `emba_group_address`, in one serializable transaction.

Alternative considered: make every group its own organization with a parent pointer. That throws away the role inheritance the access code already has and has had reviewed.

### D2. Handles stay two-part: `@namespace/slug`

The mockup wrote an inner group's handle as its full path (`@emba-2027/team-1/nbae-6830`). This design does not. An inner group's handle is `@namespace/slug`, unique in its top-level group, whatever its depth: `@emba-2027/nbae-6830`. The path is shown as crumbs, not as the handle.

Why: handles are immutable, the address table allows one segment, and events and member handles share the same two-part grammar (`@emba-2027/kickoff`, `@emba-2027/priya`). A three-part handle would change the tag parser, `resolveGroup`, the connector tool inputs and the address constraint, for a string nobody types. The form shows the handle it will really get. The loop path is built from the parent's path plus the same slug, so the slug must also be unique among siblings, which the namespace rule already guarantees.

`createInnerGroup` rejects a slug already used in the namespace by a group, an event or a member handle (the existing `emba_team_name` rule), and the reserved words `workspace`, `team`, `resources`, `in`, `new`.

### D3. Who may start a group inside a group

A person who can manage the parent (owner or organizer, on it or above it) may start a group inside it. Starting a top-level group stays with pilot owners. The creator becomes owner of the new group.

Alternative considered: any member may start one. Left for the founder (Open Questions); organizers first keeps the tree tidy during the pilot and is the smaller grant.

### D4. Who is in an inner group

Unchanged and now stated: a person is in a group when they hold a role on it or on any group above it. So everyone in EMBA 2027 can open Team 1 and counts as a member there: they see its record, may answer its asks, and appear in "who has not answered". A person invited to Team 1 only gets an organization membership and a role on Team 1; they cannot open EMBA 2027.

This is the rule the founder approved in the picker footer ("Everyone in EMBA 2027 can open it"). Its cost is in Risks.

### D5. What an inner-only person must not see

Three places read organization-wide data and would show an inner-only person things from above. Each is fixed and tested:

1. `tags.ts` offers people only to a caller who can open the root, so a person in an inner group only is offered nobody. That is safe and stays; a test pins it. The cost: such a person gets no suggestions for teammates, though a typed `@namespace/handle` of someone in their group still tags.
2. The join link and request approval treated any live membership in the top-level group as "already in". In a tree a person in Team 1 is a live member who cannot open Team 2. Now only a person the group is already open to (a role on it or above it) has nothing to join; a live member elsewhere gets the member role on this group and keeps every role they hold. A person whose role on this group was revoked, or whose membership was revoked, is not brought back by an admit link. Coming back by an organizer's approval after removal still brings one role only, as before.
3. The group's name shown to an outsider (join page, share pages, invitation) is the inner group's own name, never the top-level group's, and no page shows a parent's name to someone who cannot open the parent. Crumbs stop at the highest group the viewer can open.

`discover` already returns only loops the caller can open. A review pass over every query that joins `emba_organization` or filters by `org_id` alone is a task, not an assumption.

### D6. Join links and invitations on inner groups

`owner()` in `access-requests.ts` drops `l.parent_id is null`: the owner of an inner group (or of a group above) can turn on its join link and set admit mode. A person admitted by an inner group's link gets the member role on that group only. Invitations already take any loop.

### D7. Site routes

A root keeps `/groups/<namespace>` and its `/team`, `/resources`, `/resources/<id>`. An inner group lives at `/groups/<namespace>/in/<slug>` with the same three sub-pages. The new route files re-export the existing page modules; each page resolves its group with one helper, `groupFromParams({namespace, slug?})`, replacing the `slug === 'workspace'` filters. One helper, `groupHref(group)`, builds every link.

Alternative considered: `/groups/<namespace>/<slug>`. A group slugged `team` or `resources` would be shadowed by the static pages. A dotted single segment (`emba-2027.team-1`) was also considered and dropped: it reads as a file extension to proxies.

The rail gets the tree from one query, `listGroupTree(db, p)`: every group the person can open with its parent id, so the rail, the crumbs, the "Inside this group" list and the picker all draw from the same data. The limit stays 50 groups.

### D8. The start form is one page and one action

`/groups/new` (optionally `?in=<handle>` to open with a parent chosen) renders the picked form. The form posts to one action and shows the ready page from what the action returns, on the same address, so the join link exists only in that response and a reload shows the empty form again. The box is a client component that sorts input as the mockup does: a dropped or chosen file goes to Files; a pasted `http(s)` address to Links, or to Drive folder when it is a `drive.google.com/drive/folders/<id>` address and Drive is set up; an email address to People; any other text becomes the first announcement. A lane appears only when it has something in it.

One server action, `startGroup`, does this in order and reports each part:

1. create the group (`createWorkspace` or `createInnerGroup`). If this fails, nothing else runs and the form shows why.
2. files through `uploadDocument` then `processDocument`, as `publishResource` does now;
3. links through `fileOutput` (title = the link's host and path; `normaliseLink` validates, so https only; at most 10 links, because each is a team write and those are limited to 30 an hour);
4. the Drive folder through `connectDriveFolder` (D9);
5. people through `issueInvitation` (member role, the existing expiry);
6. the announcement through `postAnnouncement`;
7. the join link through `enableAccessRequests`.

Steps 2 to 7 are separate transactions on purpose: a bad PDF must not undo the group. The ready page lists what was added and, by name, anything that failed, with the group already usable. File size and count follow the existing upload limits (the request body limit is 4.5 MB on Vercel; larger files are added afterwards on the Resources page, and the form says so when a file is too big instead of failing the submit).

The old inline form on `/groups` and the `createGroup` action are removed; "Start your group" and every "Start a group here" link to `/groups/new`.

### D9. Drive: share one folder with Loop's service account

The owner shares one folder with a Google service account address that Loop shows in the form ("Viewer"), then pastes the folder's link. Loop stores the folder id and the folder's name in `emba_drive_folder` (one row per group) after checking it can list the folder. The Resources page lists the folder's files (name, type, modified time, link to Drive) by calling the Drive API `files.list` with `'<id>' in parents`, read-only scope, kept in memory for two minutes per folder. The list is on the site only in this change; giving it to assistants is a later step. Loop stores no file content and no user token, and asks Google for the `drive.metadata.readonly` scope, which cannot download a file.

Why this and not Google sign-in with the Picker: the service account can read only what has been shared with it, so "one folder, not the whole Drive" is enforced by Google's sharing, there is no per-user refresh token to store and protect, and no OAuth consent screen to get verified. The `drive.file` Picker route is the nicer click but, as far as I know, picking a folder there does not grant its children; that needs checking against current Google docs before anyone relies on it.

The token is a service-account JWT signed with `jose`. Config: `LOOP_DRIVE_CLIENT_EMAIL`, `LOOP_DRIVE_PRIVATE_KEY`. When either is missing the Drive lane, the service address and the Resources section do not render, and a pasted Drive folder address is an ordinary link.

Connect and disconnect need `manage` on the group and the site (no assistant). Loop's account can read every folder that anyone has shared with it, so being readable is not enough to connect: the person connecting must be the one who shared the folder with Loop, or its owner. Loop asks Google for the folder's `sharingUser` and `owners` and compares their email with the email the person signed in to Loop with. Without this, an organizer who learned another group's folder address could list its file names in a group of their own. Two costs: the person must share from the Google account that has their Loop email, and a folder inside a shared folder (which names no sharer) does not connect on its own. This check is written from Google's field reference and tested against a stub only; task 6.6 is its first real run. Everyone in the group sees the list. A file's link opens in Drive under the reader's own Google account, so Drive's sharing still decides who can open the file itself.

### D10. Tests carry the access claims

Each claim in D4 to D6 gets a PGlite test with three people: one in the outer group, one in the inner group only, one in a sibling. Page tests cover the rail tree, crumbs that stop at the highest visible group, and the form's lanes. The Drive client is tested against a stubbed `fetch`.

## Risks / Trade-offs

- [Everyone above counts as a member below, so an ask in Team 1 lists the whole cohort under "who has not answered", and the cohort can read Team 1's files] → It is the approved rule and the picker footer says it before the group is made. If the founder wants private inner groups, that is a new flag on the loop and a change to `posts`; see Open Questions.
- [The pages read `emba_loop.name` and break on a database without the migration, including the founder's running dev site] → The migration is task 1 and the founder is asked to apply it before the page work is merged or run locally.
- [A university Google Workspace may block sharing a folder with an outside service account] → The form says to try a personal Drive folder if sharing is refused; the Picker route stays open as a later change.
- [Drive file names are shown to everyone in the group even if the file itself is not shared with them] → Stated in the form next to the Drive lane: "Everyone in this group sees the names of the files in the folder."
- [The Drive ownership check depends on Google returning `sharingUser` for a folder shared with a service account, which no test here proves] → If Google leaves it out, connecting is refused for everyone (it fails closed) and the founder sees it at task 6.6.
- [A person in an inner group only sees the outer group's members in three places: who has not answered an ask, the roles list on the Members page, and the confirmation when tagging] → This follows from D4 (everyone above is a member below). Hiding them needs the private-inner-group flag; see Open Questions.
- [Handles, event names and member tags share one namespace per top-level group, so "that name is taken" tells an inner-only person that something by that name exists above] → Accepted for now; it reveals a name, never content.
- [An organizer who starts a group inside becomes its owner, and can turn on its admit link] → The link admits to that inner group and below only, as a member.
- [A partly failed create leaves a group with fewer things than were dropped] → The ready page names each failure; nothing is silently lost.
- [The second session edits `layout.tsx` and `loop.css`] → New styles go in their own block at the end of `app/loop.css`; `layout.tsx` gets the smallest change (swap the group list for the tree).

## Migration Plan

One additive migration: `emba_loop.name`, `emba_loop.description`, `emba_drive_folder`. The founder runs it on `supabase-loop` by hand. Rollback: drop the table and the two columns; no existing row is changed. Deploy after the migration. The Drive lane turns on when the founder adds the two environment variables.

## Open Questions

- Should any member be able to start a group inside a group, or only owners and organizers (D3)? Built as owners and organizers.
- Should an inner group be able to be private to its own members (D4)? Not built.
- "Leave group" is offered on the top-level group only, because leaving ends the whole membership. Leaving one inner group on your own is not built.
- An assistant is no longer given a group's path (`loopPath`), only its handle. The older `/emba` portal still prints paths to signed-in people.
- The mockup showed path handles; this builds two-part handles (D2). Say so if the path form matters more than the cost.

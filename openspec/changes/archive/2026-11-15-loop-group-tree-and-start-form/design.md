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
- Google Drive works alongside Loop, not inside it: a group keeps Drive links, and each member's own assistant opens them with that member's own Google connection.
- No path by which a person in an inner group learns about groups above it or the people who are only there.

**Non-Goals:**

- Moving, renaming, merging or deleting groups. Handles and paths stay immutable.
- Putting an existing top-level group under another. Top-level groups are separate organizations.
- Members with a role on an inner group only by default: the access rule is not changed, only stated and tested.
- Loop holding any Google access of its own: no service account, no Google sign-in for Drive, no list of a folder's files on the site.
- Changes to the connector's tools beyond what falls out of the handle rules (D2) and two sentences of guidance about links (D9).
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
5. people through `issueInvitation` (member role, the existing expiry);
6. the announcement through `postAnnouncement`;
7. the join link through `enableAccessRequests`.

Steps 2 to 7 are separate transactions on purpose: a bad PDF must not undo the group. The ready page lists what was added and, by name, anything that failed, with the group already usable. File size and count follow the existing upload limits (the request body limit is 4.5 MB on Vercel; larger files are added afterwards on the Resources page, and the form says so when a file is too big instead of failing the submit).

The old inline form on `/groups` and the `createGroup` action are removed; "Start your group" and every "Start a group here" link to `/groups/new`.

### D9. Drive works alongside Loop, through each member's own assistant

Loop holds links and nothing else. A Drive file or folder pasted into the start form, or filed later, is a link like any other (address and title). Loop has no Google credentials, calls no Google API and has no Drive table.

Reading and writing Drive happens in the member's assistant, which already has its own Google Drive connection: the assistant reads the group through Loop, finds a link, and opens it with the member's own Drive permissions. When the assistant makes a document for the group it saves it to the member's Drive through that same connection, then files the link with `file_output`. Two sentences in the descriptions of `team_state` and `file_output` say this, and say to tell the user when they have no access to a link rather than guess.

Why this and not Loop reading Drive itself (first built with a service account, then removed on 2026-11-13 at the founder's direction): it needs no setup by the founder and no token in Loop; Google's sharing stays the one rule for who can open a file; and it matches the team layer's rule that Loop keeps links, not files. Loop cannot run Google's connector for a member (the two meet only inside the member's assistant), so "embedded" is not possible; "alongside" is.

What is given up: the site cannot list the files inside a linked folder. It shows the link, which opens in Drive.

### D10. Tests carry the access claims

Each claim in D4 to D6 gets a PGlite test with three people: one in the outer group, one in the inner group only, one in a sibling. Page tests cover the rail tree, crumbs that stop at the highest visible group, and the form's lanes. The Drive client is tested against a stubbed `fetch`.

## Risks / Trade-offs

- [Everyone above counts as a member below, so an ask in Team 1 lists the whole cohort under "who has not answered", and the cohort can read Team 1's files] → It is the approved rule and the picker footer says it before the group is made. If the founder wants private inner groups, that is a new flag on the loop and a change to `posts`; see Open Questions.
- [The pages read `emba_loop.name` and break on a database without the migration, including the founder's running dev site] → The migration is task 1 and the founder is asked to apply it before the page work is merged or run locally.
- [A member's assistant has no Google Drive connection, or the member uses the site only] → They still see the link and open it by hand. Nothing in Loop depends on the connection.
- [A linked file is not shared in Drive with the rest of the group] → Members see the link but Drive refuses them; the connector tells the assistant to say so. Sharing is the file owner's to set in Drive.
- [The guidance is two sentences in tool descriptions, which an assistant may not follow every time] → It is advice to the assistant, not a rule Loop can enforce; the worst case is a link the assistant does not open.
- [A person in an inner group only sees the outer group's members in three places: who has not answered an ask, the roles list on the Members page, and the confirmation when tagging] → This follows from D4 (everyone above is a member below). Hiding them needs the private-inner-group flag; see Open Questions.
- [Handles, event names and member tags share one namespace per top-level group, so "that name is taken" tells an inner-only person that something by that name exists above] → Accepted for now; it reveals a name, never content.
- [An organizer who starts a group inside becomes its owner, and can turn on its admit link] → The link admits to that inner group and below only, as a member.
- [A partly failed create leaves a group with fewer things than were dropped] → The ready page names each failure; nothing is silently lost.
- [The second session edits `layout.tsx` and `loop.css`] → New styles go in their own block at the end of `app/loop.css`; `layout.tsx` gets the smallest change (swap the group list for the tree).

## Migration Plan

One additive migration: `emba_loop.name` and `emba_loop.description`. The founder runs it on `supabase-loop` by hand. Rollback: drop the two columns; no existing row is changed. Deploy after the migration.

## Open Questions

- Should any member be able to start a group inside a group, or only owners and organizers (D3)? Built as owners and organizers.
- Should an inner group be able to be private to its own members (D4)? Not built.
- "Leave group" is offered on the top-level group only, because leaving ends the whole membership. Leaving one inner group on your own is not built.
- An assistant is no longer given a group's path (`loopPath`), only its handle. The older `/emba` portal still prints paths to signed-in people.
- The mockup showed path handles; this builds two-part handles (D2). Say so if the path form matters more than the cost.

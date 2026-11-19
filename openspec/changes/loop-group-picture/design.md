## Context

Groups live in the `emba_*` tables and the `app/groups` pages; a group's tile is the Loop rings everywhere (`app/groups/group-nav.tsx`, `group-list.tsx`, `page.tsx`, `bar.tsx`). People's faces live in the campus code: 40 pictures shipped in `public/animals`, plus pets drawn from a photo (`lib/campus/custom-face.ts`, stored in Postgres, served at `/animals/custom/<token>`). What a person may pick is decided by `picks()` in `lib/campus/animal-tiers.ts`. There is no payment and no Ink+ in code: "has Ink" means the person asked to subscribe (`lib/campus/ink.ts`).

The founder approved the flow in `public/demo/mockups-group-picture.html` and then asked that whoever creates the group chooses the animals, mixing and matching, so a group can be set up in advance.

## Goals / Non-Goals

**Goals:**
- A person who runs a group picks animals, gets two drawings, keeps one, and everyone sees it on the group.
- The pick is free of membership: any animals the person could wear themselves.
- Ink+ interest is recorded the way Ink interest is today.
- Drawings are kept large, so saving them out of the app can be added without redrawing.

**Non-Goals:**
- Saving or downloading the picture, and the Loop mark on it.
- Redrawing by itself when membership changes.
- Charging anyone.
- The campus screen ("This week"): the picture shows on the groups pages only.

## Decisions

**D1. The animals are picked, not taken from the members.** The pane shows the same animals the person's own picker offers (core, their school's, premium when they have Ink, their own made pets; every one for the admin) and the person picks two to six, each at most once. Alternative considered: always the members' faces. Rejected: the founder wants to set a group up before its people have signed in, and people who have not signed in have no face.

**D2. Six at most.** The live test covered four. Past six a tile-sized picture is unreadable. Two is the least that is "together".

**D3. One ask, two drawings, keep one.** Both are drawn at once (two calls in parallel) from the same picks, in the way the test found best: each animal sent as its own 512px picture on white, with one short line. The person sees both and keeps one; the other is marked let go and is no longer shown to anyone but the admin. Until one is kept the group's picture does not change. This is the pattern people already know from redrawing a pet.

**D4. Storage in Postgres, as made pets are.** Table `emba_group_picture`: `token uuid` (key), `org_id`, `loop_id`, `made_by`, `ask uuid` (the same for the two drawings of one ask), `picks jsonb` (what was picked, for the admin and for a later redraw), `image bytea` (PNG, transparent, the longer side 1024), `small bytea` (PNG, 192px, for tiles), `made_at`, `kept_at`, `let_go_at`. The group's picture is its row with the newest `kept_at` and no `let_go_at`. Keeping a new one marks the earlier kept one let go. Served at `/groups/picture/<token>` (the small one) and `/groups/picture/<token>/full`, immutable, at an unguessable address, like `/animals/custom/<token>`. Alternative: Vercel Blob. Rejected: one more service for a handful of pictures, and made pets already set the pattern.

**D5. Who may.** Whoever runs the group: the same test as starting a group inside it (`canStart` in `listGroupTree`), checked again in the server action. Every member sees the picture; only those people see the pane.

**D6. Ink+ is an ask, recorded.** New table `campus_ink_plus(person_id, email, asked_at)`. A person who is not the admin and has no row sees the Ink+ plate first ("$9.99 a month", Subscribe, email); subscribing writes the row, charges nothing, and says so. `hasInkPlus()` sits beside `hasInk()` in `lib/campus/ink.ts`. Asking for Ink+ does not by itself give Ink. The admin is never asked.

**D7. A limit while nothing is charged.** Each ask costs two pictures. A person who is not the admin may ask three times in all; the fourth is refused with a plain sentence. The admin has no limit. The number is one constant.

**D8. Where it shows.** One small component, `GroupTile`, takes a group's picture address or nothing, and draws the picture or the rings. It replaces the rings in the group head, the groups list, the inside list and the team page, and the letter in the top bar. The picture's address is read with the group lists in one query (a join on the kept row), not one query a group.

**D9. The free picture comes second.** Phase two: a group with no drawn picture shows up to four of its members' faces set close inside the tile. It needs each member's face address in the group lists, which is the larger query change, so it follows the drawn picture and can ship apart.

**D10. Drawing lives beside the pet drawing.** `drawGroup(pictures)` goes in `lib/emba/group-picture.ts` and takes the drawing function as an argument, as `makeCustomFace` does, so tests never call the model. Each picked animal is read from `public/animals` or from `campus_custom_picture`.

## Risks / Trade-offs

- [The model changes an animal, or leaves one out] → two drawings an ask and the person chooses; the picks are kept, so asking again is one press.
- [A slow drawing: two pictures can take a minute] → the action allows for it (`maxDuration`), and the pane says "about a minute" while it waits. If one of the two fails the other is still offered; if both fail nothing is counted against the limit.
- [A picked pet belongs to another person] → only the person's own made pets and the animals offered to everyone can be picked, so nobody's private pet is drawn without them.
- [Bytes in Postgres] → about half a megabyte a kept drawing; let-go drawings can be cleared later by the admin.

## Migration Plan

One migration, `supabase/migrations/20261119300000_group_picture.sql`, creating the two tables. The founder applies it by hand before the code is pushed; the code from before keeps working once it is applied. Rollback: put the old code back, then drop the two tables.

## Open Questions

- Whether the three-asks limit is the right number.
- Whether asking for Ink+ should also count as having Ink.
- Whether the picture should also show on the campus screen's group names.

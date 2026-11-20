## Context

A person on Ink or Ink+ draws an animal from a pet photo in the maker (`components/campus/own-face.tsx`). Today:
- `makeCustomFace` (`lib/campus/custom-face.ts`) draws, then at once adds a `campus_custom_picture` row, raises `campus_custom_face.makes`, and puts the picture on the person's face.
- `retryCustomFace` adds a second row tied to the first by `retry_of`, with `let_go_at` set, so it waits hidden. `keepPicture` then clears `let_go_at` on the chosen one and sets it on the other. Nothing is ever deleted.
- `madeRows` and the admin's `choices` read every row, so drawings nobody kept show on `/c/admin` and in the admin's group-picture animals.
- Pictures are bytes in the database (`image`, `large`; `emba_group_picture.image`, `small`), served by `app/animals/custom/[token]/route.ts` and `app/animals/group/[token]/route.ts` with a one-year immutable cache. Each first view is a function call and a query: about 1 s from the dev server to the hosted database, and slow again in production after each deploy.

The open change `loop-ink-tiers` sets the limits (Ink 3, Ink+ none, admin none) and shows "N of 3 left" inside the maker. It is uncommitted and edits the same two files, so this change builds after it.

## Goals / Non-Goals

**Goals:**
- Nothing about a drawing is saved, worn or counted until the person keeps it. What is not kept is deleted.
- The number of animals left is shown where the person decides to make one.
- Made animals and group pictures load as fast as the built-in ones, on every page and after every deploy.

**Non-Goals:**
- Changing the limits, the prices, or who may draw.
- A school for a made animal (the admin sets tiers by hand).
- The group picture's two-drawings-then-keep-one flow, and its history of drawings, which the group keeps on purpose. Its pictures do move to Blob.

## Decisions

**D1. A draft is a row, not something held in the browser.**
A finished drawing is stored as a `campus_custom_picture` row with `draft_at` set and no `let_go_at` meaning. Drafts are never listed: `customFaces`, `madeRows`, the admin's choices and the picker all read `draft_at is null`.
- *Why not keep the draft only in the page?* The drawing takes about 20 s and costs money. A refresh, a closed tab or a flaky phone would lose a drawing the person paid for in time. A row survives that, and the maker can show "You have a drawing waiting" on return.
- *Why not reuse `let_go_at`?* It means "kept once, then let go". A draft was never kept, and mixing the two is what led to drawings piling up.

**D2. One draft per person at a time.** Drawing again replaces the draft: the old draft row is deleted in the same transaction that inserts the new one. A unique partial index (`person_id where draft_at is not null`) holds it, as the current `retry_of` index does for retries. A redraw of a kept animal stores which animal it would replace (`retry_of`), so Keep can swap them.

**D3. Keep is the only step that saves.** `keepDraft(personId, token)` in one transaction:
- checks the limit (`makes < INK_MAKES`, or Ink+, or admin), and refuses with the Ink+ offer at the limit;
- clears `draft_at`, raises `makes` for a new animal (not for a redraw of a kept one), and puts it on the face;
- for a redraw, deletes the animal it replaces. Whoever else wears that one is moved to the new one.
- Drawing itself checks the limit too, so nobody waits 20 s for a drawing they cannot keep.

**D4. Drafts are deleted, not hidden.** A draft is deleted when it is replaced, when the person presses Back or Throw away, and by a sweep of drafts older than a day. The sweep runs on the next draw or keep by anyone (`delete ... where draft_at < now() - interval '1 day'`), so no scheduled job is needed. Its Blob file is deleted with it.

**D5. The count reads what is kept.** `customFaces` already returns `left` (`null` for no limit). The "Create your own" tile gets a badge from it:
- Ink: the number left, as a small round ink badge on the tile's top-right corner (0 shows 0 and the tile opens the Ink+ offer);
- Ink+ and the admin: the Ink+ mark (the blot with the spark) in the badge's place;
- free: no badge.

The maker's own line says the same. The look is chosen from `public/demo/mockups-own-animal-count.html` before it is built.

**D6. Pictures live in Vercel Blob.** `lib/campus/picture-store.ts` wraps `@vercel/blob`'s `put` and `del`:
- a kept animal is written to `animals/custom/<token>.png` (the 192px face) and `animals/custom/<token>-large.png`; a draft to `animals/draft/<token>.png`, moved on Keep;
- a kept group picture to `animals/group/<token>.png` and `-full.png`;
- `addRandomSuffix: false`, `cacheControlMaxAge` of a year: a token never changes its picture, as today.

The row gains `blob_url` (and `blob_large_url`). `customFace(token)` and `groupPictureSrc` become readers of the row's URL wherever a page already has the row; where only the token is known they keep pointing at the old route.
- *Why Blob over the CDN cache we have?* The CDN cache is per deployment and fills one request at a time. Blob files are served from Vercel's edge from the first view, and a deploy does not empty them.
- *Why public Blob?* An `<img>` needs a public address. The addresses carry the unguessable token, which is the protection pictures have today. Private Blob would need a signed address per view, which brings back a function call.

**D7. Old addresses keep working.** `/animals/custom/<token>` and `/animals/group/<token>` answer with a permanent redirect to the Blob address when the row has one, and fall back to the bytes in the database when it does not. Shared links, saved pages, Conga and Seats (which build the address from the token) keep working.

**D8. The database keeps the bytes until Blob is proven.** For one release the `image` columns stay filled, so turning Blob off (no token in the environment) falls back to today's route. A later change drops them.

## Risks / Trade-offs

- [A person closes the tab on a draft] → The draft row survives; the maker shows it on return. After a day it is swept.
- [Two tabs draw at once] → The unique draft index keeps one; the second is told a drawing is already waiting (as `ONCE` does today).
- [Blob write fails after a keep] → The keep still succeeds and the old route serves the bytes from the database (D8). A retry writes the file on the next view of the route.
- [Deleting a kept animal someone else wears] → Only on a redraw swap, and wearers move to the new animal in the same transaction.
- [Cost] → 192px faces are about 42 KB, large drawings about 1.3 MB. Dozens of people make three each: well inside Blob's free allowance.
- [Privacy] → `lib/emba/privacy.ts` deletes a person's pictures; it must also delete their Blob files, or a deleted person's animals stay reachable by address.

## Migration Plan

1. Founder: create a Blob store on the Vercel project (Storage → Blob), which adds `BLOB_READ_WRITE_TOKEN` to production; pull it into `.env.local`.
2. Founder: run the migration by hand. It adds `draft_at`, `blob_url`, `blob_large_url` and the unique draft index, and is safe to run twice.
3. Deploy the code. With no token, everything behaves as today.
4. Run `scripts/pictures-to-blob.ts` once: it copies the 12 made animals and every group picture to Blob and fills `blob_url`.
5. Rollback: remove the token; pages fall back to the database route. The migration's columns are harmless if left.

## Open Questions

- Should Throw away on a draft ask "Sure?" first, since the drawing took 20 s? (Proposed: no, Draw again is right there.)
- Does an Ink person at 0 who upgrades to Ink+ keep a draft they could not keep before? (Proposed: yes, Keep then works.)

## Why

Making your own animal from a pet photo saves too early and hides what it costs, and every made picture loads slowly:
- A drawing is saved, worn and counted against your 3 the moment it comes back, before you have said you like it.
- Drawing it again keeps both drawings in the database. The one you did not keep is hidden but never deleted, and the admin page and the admin's picker still list it.
- Ink makes 3 animals and Ink+ makes any number, but only the maker's own pane says how many are left. The "Create your own" tile, where you decide to make one, says nothing.
- Made animals and group pictures are read from the database one request at a time. On the dev server each takes about a second. In production each one is slow again after every deploy, while the built-in animals load at once.

The founder picked "a draft until kept" (2026-11-20) and asked for the count and the faster pictures in the same change.

## What Changes

- **A drawing is a draft until you keep it.**
  - A finished drawing shows with **Keep it** and **Draw again**. Nothing is saved to your animals, worn, or counted until you press Keep it.
  - Draw again replaces the draft. Leaving the maker without keeping throws the draft away.
  - A draft is deleted when it is replaced, thrown away, or left for a day. A drawing that was not kept is never stored for good.
  - Redrawing an animal you already kept works the same: the new drawing is a draft beside it, and only what you keep stays.
  - **BREAKING (flow):** "Draw it" no longer puts the new animal on your face at once.
- **How many you have left, where you make one.**
  - The "Create your own" tile carries a badge: 3, 2, 1 on Ink. On Ink+ the badge is the Ink+ mark in place of a number.
  - At 0 on Ink the badge reads 0, and the tile opens the Ink+ offer.
  - The maker's pane says the same ("2 left" or the Ink+ mark).
  - The count drops only when you press Keep it. Drafts and redraws use nothing.
  - Free accounts see no badge: the tile already opens the Ink offer.
- **Made pictures load like the built-in ones.**
  - Each kept made animal, and each group picture, is stored in Vercel Blob when it is kept, and pages point at its Blob address.
  - The database keeps the picture's row (who made it, its name, words, tier), but no longer serves its bytes to pages.
  - The addresses `/animals/custom/<token>` and `/animals/group/<token>` keep working, and send the browser on to the Blob address, so links already shared do not break.
  - The 12 made animals and the group pictures that exist today are copied to Blob once.
- **Not in this change:** a school for a made animal (the admin sets that by hand later), and the group picture's own history of drawings, which the group keeps on purpose.

## Capabilities

### New Capabilities
- `own-animal-drafts`: a drawn own animal is a draft until kept; what happens to drafts; when the count drops; the makes-left badge on the tile and in the maker.
- `picture-delivery`: where made animals and group pictures are stored and served from, and that their old addresses keep working.

### Modified Capabilities
- (none) The limits themselves (Ink 3, Ink+ none) are set by the open change `loop-ink-tiers` and do not change here.

## Impact

- **Drawing and keeping:** `lib/campus/custom-face.ts` (`makeCustomFace`, `retryCustomFace`, `keepPicture`), `app/c/actions.ts` (the make, again and keep actions), `components/campus/own-face.tsx`.
- **The count:** `components/campus/screen.tsx` (the "Create your own" tile), `components/campus/own-face.tsx`, `app/c/campus.css`, the Ink+ mark from `components/campus/ink-mark.tsx`.
- **Pictures:** a new `lib/campus/picture-store.ts` around `@vercel/blob`; `app/animals/custom/[token]/route.ts`, `app/animals/group/[token]/route.ts` and `.../full/route.ts`; `lib/campus/animals.ts` (`customFace`), `lib/emba/group-picture-src.ts`; `lib/emba/group-picture.ts` (keeping a drawing); `lib/emba/privacy.ts` (deleting a person's pictures deletes them from Blob too).
- **Database:** a migration adds a `blob_url` column to `campus_custom_picture` and `emba_group_picture`, and a `draft` state for a made picture. Run by hand by the founder.
- **Dependencies and setup:** `@vercel/blob`; a Blob store on the Vercel project and its `BLOB_READ_WRITE_TOKEN` in production and in `.env.local` (founder steps).
- **Order:** builds after `loop-ink-tiers` is committed, since both change `custom-face.ts` and `own-face.tsx`.

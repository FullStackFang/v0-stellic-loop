## 0. Before building

- [x] 0.1 Founder picks the badge look from `/demo/mockups-own-animal-count.html`
- [ ] 0.2 `loop-ink-tiers` is committed (it edits `custom-face.ts` and `own-face.tsx` too)
- [ ] 0.3 Founder: create a Vercel Blob store on the project; `BLOB_READ_WRITE_TOKEN` is in production and `.env.local`

## 1. Database

- [ ] 1.1 Migration: `draft_at` on `campus_custom_picture`; `blob_url`, `blob_large_url` on `campus_custom_picture` and `emba_group_picture`; unique partial index on `person_id where draft_at is not null`. Safe to run twice; SQL pasted in the reply for the founder
- [ ] 1.2 Readers that list made animals (`customFaces`, `madeRows`, the admin's `choices`, `animal-tiers.ts`, `people.ts`, `stats.ts`) skip drafts, checking the column is there first (as `saidRows` does)

## 2. Drafts

- [ ] 2.1 Test first: drawing makes a draft that is not listed, not worn, not counted
- [ ] 2.2 `makeCustomFace` writes a draft only; Draw again replaces the draft in one transaction; the limit is checked before drawing
- [ ] 2.3 `keepDraft`: checks the limit, clears `draft_at`, raises `makes` for a new animal only, wears it; for a redraw, swaps the old one out and moves its wearers
- [ ] 2.4 `throwDraft` on Back / Throw away; the day-old sweep runs on each draw and keep
- [ ] 2.5 Actions in `app/c/actions.ts` for draw, again, keep, throw; old `retryCustomFace` / `keepPicture` paths removed
- [ ] 2.6 `own-face.tsx`: the draft shows with Keep it and Draw again; a waiting draft shows on return; the face changes only on Keep

## 3. The count

- [ ] 3.1 Test first: the "Create your own" tile's badge reads 3/2/1/0 on Ink, the Ink+ mark on Ink+ and for the admin, nothing on free; accessible names "N left" / "no limit"
- [x] 3.2 Badge on the tile in `components/campus/screen.tsx`, in the picked look; at 0 the tile opens the Ink+ offer
- [ ] 3.3 The maker's line says the same, replacing "N of 3 left"

## 4. Pictures in Blob

- [ ] 4.1 Add `@vercel/blob`; `lib/campus/picture-store.ts` with `putPicture`, `deletePicture`, and a no-op when there is no token
- [ ] 4.2 Keeping a made animal or a group picture writes its files and fills `blob_url`
- [ ] 4.3 Pages that have the row point at `blob_url` (`customFace`, `group-picture-src.ts`, Conga and Seats lists)
- [ ] 4.4 `/animals/custom/<token>`, `/animals/group/<token>` and `/full` redirect to `blob_url` when set, else serve from the database as now
- [ ] 4.5 Deleting a draft, a swapped animal, the admin's Delete for good and `privacy.ts` delete the Blob files
- [ ] 4.6 `scripts/pictures-to-blob.ts`: copy every kept made animal and group picture once, keeping tokens; safe to run twice

## 5. Check

- [ ] 5.1 Run only the affected tests (`--maxWorkers=3`)
- [ ] 5.2 On localhost: draw, draw again twice, keep: one animal, count down by one, nothing else on `/c/admin`
- [ ] 5.3 On localhost with the token: the picker and Conga load made animals from Blob addresses; an old `/animals/custom/` link still opens

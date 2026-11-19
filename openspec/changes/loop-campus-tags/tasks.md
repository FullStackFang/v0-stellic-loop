## 1. Founder decisions

- [x] 1.1 Founder agrees the direction: an @ is any tag; kinds worked out, not asked; same-meaning tags grouped automatically; people left for later (2026-11-18)
- [ ] 1.2 Founder reads "My calls the founder has not confirmed" in `design.md` and says which to change
- [x] 1.3 (2026-11-18: no model for now. Start from the built-in word list, keep every tag and plan that gets made, and group them in a batch about once a month; it does not need to be real time) Founder decides whether student-written titles may be sent to a model (design D9); without a yes, build layers 1 and the admin tools only

## 2. Data

- [x] 2.1 Migration dated after the newest in `supabase/migrations/`: `campus_tag.kind` (check: place, activity, event, other; null allowed), `same_as` (references `campus_tag`, not itself), `sorted_at`, `by_hand`; table `campus_listing_tag(listing_id, tag_id, position)` with row level security on and no grants, as `campus_tag` has; copy every `campus_listing.tag_id` into it; set existing tags to kind place with `sorted_at` now. The founder applies it by hand.

## 3. The line reads several tags

- [x] 3.1 Failing tests first in `lib/__tests__/campus-line.test.ts`: two tags in order; four kept and a fifth left in the title; "@jogging @tonight" is one tag and a time; "in/at/on" dropped before each tag
- [x] 3.2 `lib/campus/line.ts`: `tags: string[]`, with `tag` kept as the first; make 3.1 pass

## 4. Posting stores the list

- [x] 4.1 Failing tests first (`lib/__tests__/campus-tags.test.ts`, hosted database, no Docker): a plan posted with two tags has both in order; its `tag_id` is its first place tag, or null when it has none
- [x] 4.2 `lib/campus/plans.ts`, `app/c/actions.ts`, `lib/campus/tags.ts`: store the list; make 4.1 pass

## 5. Grouping, layer 1: the word table

- [x] 5.1 Failing tests first: jogging joins running; college-town joins collegetown; a plural joins its singular; a place and an activity are never joined; the lead is the most-used tag; a `by_hand` tag is left alone
- [x] 5.2 `lib/campus/words.ts`: export a helper that says which table row a word falls under; `lib/campus/tags.ts`: `sortTag`, run inside posting; make 5.1 pass

## 6. Grouping, layer 2: the model (only after 1.3 is a yes)

- [x] 6.1 (dropped by 1.3, not built) Read the installed AI SDK docs under `node_modules/ai/docs/` for structured output before writing the call
- [x] 6.2 (dropped by 1.3, not built) Failing tests first, with the model call injected as a function: kind is taken; `sameAs` is taken only at 0.8 or more, same kind, and from the offered list; a made-up name is ignored; a failure sets `sorted_at` and changes nothing else; the request holds no person's details
- [x] 6.3 (dropped by 1.3, not built) `lib/campus/tags.ts`: `sweepTags` (up to 40, oldest first), behind `LOOP_TAG_SORTING`; call it from `/api/cron/campus-feeds`; add the switch to `.env.example`; make 6.2 pass

## 7. Suggestions and the panel

- [x] 7.1 Failing tests first: `nearTags` counts a group as one and returns its lead; typing a member's prefix offers the lead; a plan with only an activity tag is not treated as having a place
- [x] 7.2 `lib/campus/tags.ts` (`nearTags` by group, with each group's member slugs for matching), `components/campus/composer.tsx` (several tags understood, wording says tags where it means tags, one chip per tag); make 7.1 pass
- [x] 7.3 Mockup first for the panel wording and the chips (`public/demo/mockups-campus-tags.html`), founder picks, then build (2026-11-18: founder turned down three tall directions and three wide ones, and asked for three lines with only the top choices; built that way, and the mockup page now shows what is built)

## 8. Admin

- [x] 8.1 Failing tests first: change kind, join, split; each sets `by_hand`; only the admin may
- [x] 8.2 `app/c/admin/page.tsx` and `actions.ts`: a "Tags" section; make 8.1 pass

## 9. Finish

- [x] 9.1 Full test run (`--maxWorkers=3`, output to a file), `tsc --noEmit`, lint
- [x] 9.2 (2026-11-18: founder agreed to skip the local build; the deploy's own build is the check) One production build at the end, with no dev server running
- [ ] 9.3 (migration applied by the founder 2026-11-18; deploy and the live check are left) Founder applies the migration, then deploys; post "@jogging @collegetown" on a real campus and check the group and the map

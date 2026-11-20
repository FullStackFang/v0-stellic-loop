## 1. The plan reader

- [ ] 1.1 Add `Plan`, `planOf` and `plansOf` to `lib/campus/ink.ts`. Make `hasInk` true for Ink+, and rewrite the `hasInkPlus` comment so it no longer says Ink+ leaves out Ink. Write tests first, covering free, Ink, Ink+, and both.
- [ ] 1.2 Check every `hasInk` caller now gets Ink+: `lib/campus/people.ts`, `custom-face.ts` (Ink animals) and `lib/emba/group-picture.ts`. Add a test that an Ink+ person may keep an Ink animal, and that their group picture includes the Ink animals.

## 2. Faces carry the plan

- [ ] 2.1 In `lib/campus/view.ts`, replace `ink: boolean` with `plan: Plan` in `Face` and `Choice`. Fill it from `plansOf` in `lib/campus/screen.ts`. Fix every fixture the type check finds.
- [ ] 2.2 Read `planOf` in the groups layout (`app/groups/layout.tsx`) and pass `plan` to `Bar`. Replace the `ink` prop.

## 3. Marks and the sparkle

- [ ] 3.1 `InkMark({ plus })` in `components/campus/ink-mark.tsx`: the blot alone by default, the spark cut in with `plus`. Add `InkSparks`.
- [ ] 3.2 Add the sparks CSS next to `.cs-blot`: three sizes and places, the staggered `twinkle`, `--cs-third` with an ink stroke, and still under reduced motion. Make sure the groups pages get the same rules, shared rather than copied.
- [ ] 3.3 Faces: the blot for `plan !== 'free'`, plus `InkSparks` for `'plus'`. Cover the campus `Dot`, `near.tsx`, the account avatar, and the groups bar avatar. The accessible name says "has Ink" or "has Ink+". Test each of the three looks.
- [ ] 3.4 Mark each use per the design's table. Use `plus` on: the Ink+ ask tabs (`assistants-link.tsx`, `kit.tsx`, save-face, group picture), the locked schools in the "Any school" list and its foot link, the foot's "Every school" pill, and the account row for Ink+. Everything else keeps the blot alone.
- [ ] 3.6 Use the mark, not the name, in features. Ask-card tabs become the mark alone. The foot pill reads "Every school" with the Ink+ mark. The picker filter is the Ink mark alone. Each mark gets an accessible name ("Ink" or "Ink+"). Keep the words only on the Ink page and tab, the account row, and ask-card bodies.
- [ ] 3.5 Have the loader pass `plan` (with `'plus'`) through `rememberMe` from `components/campus/screen.tsx` and `app/groups/bar.tsx`. Test that the splat gets `'plus'`.

## 4. Pet-photo animals by plan

- [ ] 4.1 Replace `MAKES` with `makesFor(plan)` in `lib/campus/custom-face.ts`: free 0, Ink 3, Ink+ unlimited, and the admin unlimited. `left` becomes `null` for no limit. An Ink+ person's first make takes the email from `campus_ink_plus`. Write the tests first: Ink makes a third and is stopped at a fourth, Ink+ makes a sixth, and Ink+ is not asked for an email.
- [ ] 4.2 The maker pane (`components/campus/own-face.tsx` and the account card) shows "N of 3 left" on Ink and no count on Ink+. At 0 left it offers Ink+ at $9.99. Free sees that Ink gives three.

## 5. Games

- [ ] 5.1 `congaPlayer` gives your own animal with `hasInk`, which includes Ink+. Update `app/conga/route.test.ts` and `app/seats/route.test.ts`.
- [ ] 5.2 In `public/seats/index.html` and `public/conga/index.html`, the ask pill drops its "Ink+" text for the Ink mark (the blot, drawn inline), and the comments say Ink.

## 6. Asks and the account row

- [ ] 6.1 Every Ink+ ask says $9.99 a month: `InkColours` (replacing "From $2.99"), Assistants, save with no mark, the group picture, and the connections page. To someone on Ink it says "You have Ink. Ink+ adds …", with "$9.99 a month, in place of $2.99" and "Move to Ink+". Ink asks keep $2.99. Test the colours card's price and the Ink-member wording.
- [ ] 6.2 The account row (`components/campus/screen.tsx` `.cs-inkrow`): free stays "Loop Ink" with a button. Ink shows "You have Ink" and offers Ink+ at $9.99. Ink+ shows "You have Ink+" with the Ink+ mark. Update `app/c/campus-screen.test.tsx`.

## 7. The Ink page

- [ ] 7.1 Make sure `public/demo/mockups-premium.html` has no one else's uncommitted edits. Then make its table and tier cards match the approved table: Assistants and the group picture under Ink+, pets as 3 and No limit, own animal under Ink, and a "New things first" row for Ink+.

## 8. Check and land

- [ ] 8.1 Run `tsc --noEmit`, then the full vitest with `--maxWorkers=3`, then one `next build`.
- [ ] 8.2 Look at it on localhost:3000 as free, Ink and Ink+: a ticket pile, the avatar, the account row, the picker, the colours card, Assistants, and Seats. Take screenshots at 1440 and 390.
- [ ] 8.3 Commit only these paths, open a PR to main and merge it. Then update the memory `loop-ink-colours-lock.md`.

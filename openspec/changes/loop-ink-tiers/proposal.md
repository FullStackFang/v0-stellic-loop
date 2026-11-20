## Why

Loopd has two paid plans, and the founder means them as two steps, the way Nitro Basic and Nitro are: **Ink** at $2.99 (make it yours) and **Ink+** at $9.99 (everything in Ink, then your AI, any school's colours, no limits, and new things first). The app keeps them apart in its tables, but treats them as unrelated and mixes up what each gives:
- someone on Ink+ gets none of Ink;
- every pet-photo animal is capped at 1;
- playing as your own animal in the games needs Ink+;
- one mark, the blot with the spark, stands for both plans;
- an Ink+ face looks like an Ink face;
- the colours card asks "From $2.99" for an Ink+ perk;
- the Ink page puts Assistants under Ink.

The founder approved the split and the look in `public/demo/mockups-ink-tiers.html` ("this is perfect") and asked for it across the whole app.

## What Changes

- **Ink+ includes Ink.** Every check for Ink is true for someone with Ink+. Whoever has Ink+ has the Ink animals, Ink on their face, the pet maker, and everything else Ink gives.
- **Animals from a pet photo:**
  - Ink makes 3 in all, and Ink+ has no limit (today it is 1 for anyone who asked).
  - Loopd (free) makes none; the maker shows that Ink gives three.
  - The admin stays unlimited.
- **Your own animal in Seats and Conga comes with Ink** (today Ink+).
- **Two marks:**
  - the **blot alone** marks what comes with Ink (Ink animals, the pet maker, the Ink filter, the account card's Ink row, the Ink tab);
  - the **blot with the spark in its middle** marks what comes with Ink+ (Assistants, any school's colours, saving with no mark, the group picture, every "Ink+" tab on an ask card).
  - **BREAKING (look):** the mark the app draws today, the blot with the spark, now means Ink+ only.
- **Ink+ faces: the same blot, with three small sparks that take turns twinkling.**
  - It shows wherever a face shows: the campus screen, tickets and piles, the account avatar, and the groups bar.
  - The splat when a page loads shows it too: the loader is told "plus" for someone with Ink+.
  - The face's accessible name says "has Ink+".
- **Prices on asks:**
  - Every Ink+ ask says $9.99 a month. The colours card's "From $2.99" becomes "$9.99 a month".
  - To someone who already has Ink, an Ink+ ask says what Ink+ adds, and that it is $9.99 in place of $2.99.
  - Ink asks keep $2.99.
- **The account card's Ink row** says "You have Ink+" for someone with Ink+, and "You have Ink" with a way to Ink+ for someone on Ink.
- **The Ink page** (the mockup at `/demo/mockups-premium.html` that `/c/ink` shows) follows the approved table:
  - Assistants moves to Ink+;
  - pet-photo animals read 3 and No limit;
  - "New things first" is an Ink+ row;
  - the tier cards say the same.
- **Not in this change:** the "New things first" shelf (nothing to try yet), and the "Later" rows (the stamp book, gifts, boosts, matched rewards, friends, other schools, the wider map). They stay as the Ink page lists them.

## Capabilities

### New Capabilities
- `ink-tiers`: what Ink and Ink+ each give, that Ink+ includes Ink, the pet-photo limits, the two marks and the Ink+ face effect, and how an Ink+ ask reads to someone on Ink.

### Modified Capabilities
- `ink-placements`:
  - the Ink mark on a face distinguishes Ink+;
  - the account row names the plan you have;
  - the picker's Ink animals wear the Ink mark (the blot alone).
- `doodles`: your own animal plays Seats (and Conga) with Ink, not Ink+.

## Impact

- **Plan checks:** `lib/campus/ink.ts` (`hasInk`, `hasInkPlus`, a plan reader); `lib/campus/custom-face.ts` (the per-plan make limit); `lib/campus/conga.ts` (Ink for your own animal); `lib/campus/screen.ts` and `lib/campus/view.ts` (faces carry the plan); `app/groups/layout.tsx` (the groups bar's plan); `lib/emba/group-picture.ts` (Ink animals for Ink+).
- **Marks and faces:** `components/campus/ink-mark.tsx` (two marks, the Ink+ face sparks), every use of `InkMark` and `InkBlot` (`components/campus/screen.tsx`, `top-bar.tsx`, `kit.tsx`, `foot.tsx`, `assistants-link.tsx`, `save-face.tsx`, `own-face.tsx`, `app/groups/bar.tsx`, `app/groups/group-picture.tsx`), and `app/c/campus.css` for the sparks.
- **Loader:** `rememberMe` callers in `components/campus/screen.tsx` and `app/groups/bar.tsx` pass "plus".
- **Asks and copy:** `components/campus/kit.tsx`, `assistants-link.tsx`, `save-face.tsx`, `app/groups/group-picture.tsx`, `app/groups/connections/page.tsx`, `components/campus/own-face.tsx`.
- **Games:** `public/seats/index.html` and `public/conga/index.html` (the "Ink+" pill becomes "Ink"), `app/seats/route.ts`, `app/conga/route.ts`.
- **Ink page:** `public/demo/mockups-premium.html`.
- **No database migration:** both plans already have their tables (`campus_custom_face`, `campus_ink_plus`), and the make count is already kept.
- **Tests:** in the files above, plus `app/c/campus-screen.test.tsx`, `lib/__tests__/emba-group-picture.test.ts`, `app/seats/route.test.ts`, `app/conga/route.test.ts`, and `components/campus/foot.test.tsx`.

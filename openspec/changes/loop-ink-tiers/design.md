## Context

Today the two paid plans are two unrelated facts, and both mean only that the person asked to subscribe; nothing is charged:
- **Ink** is a row in `campus_custom_face`, made when someone presses Subscribe on their own animal. `hasInk` in `lib/campus/ink.ts` checks it, and `customFaces(...).asked` checks it for many people at once.
- **Ink+** is a row in `campus_ink_plus`, made by `subscribeInkPlus`. `hasInkPlus` checks it.

`hasInkPlus` says in so many words that "asking for Ink+ does not by itself give Ink". Every check that should be true for both plans looks at one table only:
- the Ink animals (`lib/campus/people.ts`, `custom-face.ts`);
- the face blot (`lib/campus/screen.ts`, `app/groups/layout.tsx`);
- the group picture's Ink animals (`lib/emba/group-picture.ts`).

Pet-photo animals are capped by `MAKES = 1` in `lib/campus/custom-face.ts`. The games check `hasInkPlus` (`lib/campus/conga.ts`).

The marks are in `components/campus/ink-mark.tsx`:
- `InkBlot(seed)` is a face's blot.
- `InkMark` is the small mark, and is always the blot with the spark cut in (`cut={SPARK}`).

The loader (`rememberMe` / the splat in `components/loading`) already draws a `'plus'` plan with sparks, but no caller passes it.

The approved look is `public/demo/mockups-ink-tiers.html`:
- the table (section 1);
- two marks and the Sparkles face (section 2);
- the change list (section 3).

## Goals / Non-Goals

**Goals:**
- One plan reader that answers free, Ink or Ink+, where Ink+ includes Ink.
- Every place in the app gives what the table says, and wears the right mark.
- The pet-photo limit follows the plan.
- Ink+ faces wear the Sparkles effect wherever a face shows, and the loader too.
- Every ask states the right price.

**Non-Goals:**
- Payment. Both plans stay "asked to subscribe".
- The "New things first" shelf and every "Later" row.
- Leaving or downgrading a plan.
- Sheen and Glinting drops (shown in the mockup, not picked).

## Decisions

### 1. One plan reader, in `lib/campus/ink.ts`

Add `type Plan = 'free' | 'ink' | 'plus'` and two readers:
- `planOf(q, personId)` for one person;
- `plansOf(q, personIds)` for many: one query over both tables, giving a `Map<id, Plan>`.

`hasInk` becomes `(await planOf(...)) !== 'free'`. `hasInkPlus` keeps its meaning. Every caller that asks "Ink?" now gets true for Ink+, without changing its call.

The batch reader replaces `customFaces(...).asked` as the source of a face's plan in `lib/campus/screen.ts`. `asked` stays for what it also means: that the person has given an email for the pet maker.

*Alternative:* write a `campus_custom_face` row whenever someone asks for Ink+. Rejected: it would mix two facts in one table, and the existing Ink+ members would need a backfill.

### 2. Faces carry the plan, not a flag

In `Face` and `Choice` (`lib/campus/view.ts`), replace `ink: boolean` with `plan: Plan`. This keeps one field and leaves no two ways to say the same thing.

The face code chooses the blot with `plan !== 'free'` and the sparks with `plan === 'plus'`:
- `components/campus/screen.tsx` (`Dot`);
- `near.tsx`;
- the groups bar.

The accessible name says "has Ink" or "has Ink+".

The groups layout reads `planOf` in place of `hasInk` and passes `plan` to `Bar`. `Bar` passes it to `rememberMe` (the loader) and to the avatar.

### 3. Two marks: `InkMark` takes `plus`

`InkMark({ plus = false })`:
- draws the blot alone by default;
- cuts the spark into its middle with `plus`.

Every use is sorted by what it marks:

| Blot alone (Ink) | Blot with the spark (Ink+) |
|---|---|
| the Ink tab (top bar) | the "Ink+" tab on every ask card (Assistants, colours, save, group picture) |
| the account card's Ink row (when on free or Ink) | the account row for someone with Ink+ |
| the picker's Ink filter and Ink animals | locked schools in "Any school", the foot's "Every school" pill |
| the own-face pane and the pet maker | the group picture's Ink+ ask |
| the group picture's Ink kind | |

A tab or row that is about Ink+ wears the spark; one about Ink wears the blot. The Ink tab leads to the page for both plans, so it wears the blot (the family's mark).

### 4. The Sparkles face effect

Add `InkSparks` in `ink-mark.tsx`: three spark SVGs in a span, laid over the face like the blot (`inset:-30%`). The CSS lives with `.cs-blot` in `app/c/campus.css`:
- three sizes and places, as in the mockup;
- the `twinkle` keyframes, staggered `.9s` and `1.7s`;
- `--cs-third` fill, with an ink stroke;
- still under `prefers-reduced-motion`.

`.cs-inked` gets the sparks after the face, so they sit above it.

For the groups bar, `app/groups/groups.css` gets the same rules if `.cs-inked` is not already shared there. Check which file styles `.cs-inked` on /groups, and share it rather than copy it.

### 5. The pet-photo limit by plan

Replace `MAKES = 1` with `makesFor(plan)`:
- free: 0;
- Ink: 3;
- Ink+: `Infinity`;
- the admin stays unlimited through the existing flag.

`makeCustomFace` reads the plan.

The first make still records the Ink ask: it creates the `campus_custom_face` row, needs an email, and makes the person Ink. So "free makes none" means a free person's first make is their subscribe. The pane already says so, and says Ink gives three.

For an Ink+ member with no `campus_custom_face` row, the email comes from `campus_ink_plus`, so they are not asked again.

`left` becomes the count left on Ink, and `null` for no limit. The pane shows:
- "2 of 3 left" on Ink;
- no count on Ink+;
- when it reaches 0, the Ink+ ask in place of the button.

### 6. Games: Ink, not Ink+

`congaPlayer` uses `who.admin || await hasInk(...)`, which now includes Ink+. The field `ink` keeps its name.

In `public/seats/index.html` and `public/conga/index.html`, the ask pill reads "Ink" and the comments say Ink. The games' own spark on the player's animal stays: it marks "this is you", not a plan.

### 7. Prices and asks

These Ink+ asks say "$9.99 a month":
- `InkColours` (`kit.tsx`);
- the Assistants card;
- the save-face no-mark ask;
- the group-picture ask;
- the connections page.

`InkPlusAsk` takes `plan`. To someone on Ink it says "You have Ink. Ink+ adds …", with "$9.99 a month, in place of $2.99" and "Move to Ink+" (the mockup's wording). Ink asks keep $2.99.

### 8. The account row

`components/campus/screen.tsx` `.cs-inkrow`:
- **free:** "Loopd Ink" and the button, as today;
- **Ink:** "You have Ink", with "Every Ink animal is yours, and 3 pets from a photo", and a second short line: the spark mark, "Ink+", and "Get Ink+ $9.99";
- **Ink+:** "You have Ink+" with the spark mark.

The row stays one row per plan, as the existing spec says, so no plan row is added elsewhere.

### 9. The Ink page

`public/demo/mockups-premium.html` follows the approved table. It has another session's uncommitted edits, so the edit waits until the founder has committed them. Check `git status` first, and change only its table rows and tier cards.

## Risks / Trade-offs

- **Ink+ members now wear sparks, and their Ink rows change on deploy.** That is the intent.
- **People who made one pet can now make two more.** That is the intent. The `makes` column already counts, so no migration is needed.
- **`plan` replaces `ink` in `Face`, which touches many fixtures.** A type error finds every one; tests follow.
- **The sparks add three SVGs per Ink+ face in big piles.** They are small inline paths, a pile shows few faces, and there is one CSS animation each. Acceptable.
- **The Ink+ email fallback for pets reads a second table.** It runs only on the first make.

## Migration Plan

No database migration. Deploy is the merge to main (PR). Rollback is a revert.

## 1. Foundations

- [x] 1.1 Add `lib/campus/ink.ts`: `INK_PAGE` (the mockup's address) and `hasInk(q, personId)` wrapping `subscribed()`; unit test for `hasInk`
- [x] 1.2 Add an `InkMark` component (the dashed ring with a dot) in `components/campus/`, sized by its font size
- [x] 1.3 Add one block at the end of `app/c/campus.css` for the tab, the account row, the picker mark and the mark on a face, using kit tokens only

## 2. The name

- [x] 2.1 Write failing tests: no rendered student text contains "Premium" (ask pane, picker, account card, locked-animal message)
- [x] 2.2 Replace "Loop Premium" and "Premium" with "Loop Ink" and "Ink" in `components/campus/own-face.tsx`, `components/campus/screen.tsx` and `NEEDS_PREMIUM` in `lib/campus/animal-tiers.ts`
- [x] 2.3 Replace the ask pane's perk list with the four Ink perks and the line saying which are not available yet
- [x] 2.4 Update existing tests that assert the old wording

## 3. The tab in the bar

- [x] 3.1 Write failing tests: the bar shows a link named "Ink" to `INK_PAGE`, signed in and signed out, on the campus screen and on a groups page
- [x] 3.2 Add the tab to the bar in `components/campus/screen.tsx`
- [x] 3.3 Add the tab to `app/groups/bar.tsx`
- [x] 3.4 Under 520px show the mark alone, keeping the accessible name "Ink"

## 4. The account row

- [x] 4.1 Write failing tests: the account card shows "Loop Ink" with a button to `INK_PAGE` without Ink, and "You have Ink" with it
- [x] 4.2 Add the row to the account card in `components/campus/screen.tsx`, replacing the "Premium" tag beside the name

## 5. The picker

- [x] 5.1 Write failing tests: Ink animals wear the mark; the filter is labelled "Ink"; a "With Ink" chip links to `INK_PAGE`; pressing a locked animal still opens the ask pane
- [x] 5.2 Make the changes in the picker in `components/campus/screen.tsx`

## 6. The mark on faces

- [x] 6.1 Add `ink: boolean` to `Face` in `lib/campus/view.ts` and fill it in `lib/campus/screen.ts` from the query that already reads made pictures; test that the admin without Ink is `false`
- [x] 6.2 Write failing tests: a ticket with four faces, one with Ink, shows the mark on that one only, and its name says "has Ink"
- [x] 6.3 Draw the mark in `FaceDot` and on the avatar in both bars

## 7. Check

- [x] 7.1 `tsc --noEmit` and the full test run (`--maxWorkers=3`, stderr to a file)
- [x] 7.2 Look at the campus screen and a groups page in the browser, in the default kit and the Cornell kit, at desktop and phone width
- [ ] 7.3 One production build at the end, with no dev server running
- [ ] 7.4 Optional, on the founder's word: rename "Premium" on the admin page

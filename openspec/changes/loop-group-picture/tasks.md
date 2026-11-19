## 1. Database

- [x] 1.1 Write `supabase/migrations/20261119300000_group_picture.sql`: tables `emba_group_picture` and `campus_ink_plus` as in design D4 and D6, with the apply and rollback notes at the top
- [x] 1.2 Add the two tables to the test database set-up, and confirm the existing suite still passes

## 2. Drawing and keeping (lib)

- [x] 2.1 Tests first, in `lib/__tests__/emba-group-picture.test.ts`, with a stand-in drawing function: who may, two to six, an animal the person may not pick, two drawings from one ask, one fails, both fail, keeping one, a newer picture, leaving without keeping
- [x] 2.2 `lib/emba/group-picture.ts`: `drawGroup` (each pick as its own 512px picture on white, one short line, transparent, kept at 1024 and at 192), `askGroupPicture`, `keepGroupPicture`, `groupPictureImage`
- [x] 2.3 Ink+: tests, then `hasInkPlus` and `subscribeInkPlus` in `lib/campus/ink.ts`, and the three-asks limit with the admin exempt

## 3. Serving the picture

- [x] 3.1 Routes `app/animals/group/[token]/route.ts` (small) and `app/animals/group/[token]/full/route.ts`, immutable, 404 for an unknown token
- [ ] 3.2 Carry each group's picture address on the group types the pages use (`groupPictures` reads them in one statement; waits for the groups look-and-feel work)

## 4. The pane

- [ ] 4.1 Server actions: subscribe to Ink+, ask for drawings (with `maxDuration`), keep one; each checks again who the person is
- [ ] 4.2 "Group picture" pane on the group's page for people who run it, in the campus look of the groups pages: the Ink+ plate, the animals to pick with a count, the wait, the two drawings, keep one
- [ ] 4.3 Page tests for the pane: not offered to a plain member, the Ink+ plate first, the admin straight to the animals

## 5. Where it shows

- [ ] 5.1 `GroupTile`: the picture or the rings; use it in the group head, the groups list, the inside list and the team page
- [ ] 5.2 The top bar shows the picture in place of the group's letter
- [ ] 5.3 Check in the running app, signed in as a test account: make a picture for a group, keep one, and see it as another member

## 6. The free picture of members' faces

- [ ] 6.1 Tests, then read up to four members' face addresses with the group lists
- [ ] 6.2 `GroupTile` shows the faces set close when there is no drawing and more than one member
- [ ] 6.3 Check in the running app beside a group with a drawing

## 7. Finish

- [ ] 7.1 Full test run (`--maxWorkers=3`), `tsc --noEmit`, lint
- [ ] 7.2 One production build, with no dev server running
- [ ] 7.3 Paste the migration SQL for the founder, and push only after it is applied

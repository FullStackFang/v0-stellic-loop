## 1. Keep made animals large

- [x] 1.1 Migration: `large bytea` on `campus_custom_picture`, with the apply and rollback notes at the top
- [x] 1.2 Tests, then `lib/campus/custom-face.ts` keeps the drawing at up to 1024px when an animal is made or redrawn, and reads it back

## 2. Making the saved picture

- [x] 2.1 Tests first for the route: each shape's size, the sticker's transparent ground, signed out, no mark refused without Ink+, no mark given with Ink+ and to the admin, a group's picture for a member only
- [x] 2.2 `/c/save` with `ImageResponse`: the three shapes, the five colours, the Archivo font, the Loop mark
- [x] 2.3 The sticker's white edge, made with sharp from the large drawing

## 3. The pane

- [x] 3.1 "Save your picture" row and pane in the account card: shapes, preview, colours, "With the mark" and "No mark · Ink+", Save
- [x] 3.2 The Ink+ plan in the pane, using `subscribeInkPlus`
- [x] 3.3 A picture with no large drawing is saved from the small one, made larger (design D5); someone wearing their own photo is told to pick an animal
- [x] 3.4 Component tests for the pane's states

## 4. Group pictures

- [x] 4.1 "Save the picture" on a group's picture, for its members, with the group's name
- [x] 4.2 Tests: a member saves, a stranger is refused

## 5. Finish

- [ ] 5.1 Check each shape as a real file: as a profile picture in a round crop, as a phone's lock screen, as a sticker on a dark and a light ground
- [ ] 5.2 Full test run (`--maxWorkers=3`), `tsc --noEmit`, lint, one production build
- [ ] 5.3 Paste the migration SQL for the founder, and push only after it is applied

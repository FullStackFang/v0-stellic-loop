## 1. Decide

- [x] 1.1 The open ground: Cornell's hill (the founder, 2026-11-23), open to everyone

## 2. The rule

- [x] 2.1 Tests first: `mayPlay` for each kind of player (signed out, no grounded school, one school, two schools, Ink+, admin) against every ground and a ground that does not exist
- [x] 2.2 `OPEN_GROUND` and `mayPlay` in `public/conga/maps.js`
- [x] 2.3 `saveBest()` calls `mayPlay`; `lib/campus/conga-board.test.ts` holds the new rule

## 3. The game

- [x] 3.1 `free()` and `mineSchool()` read `mayPlay`; the old rule's comment is rewritten
- [x] 3.2 The ground at load is settled where `where` is first set, from the player written into the page; the picker opens on a ground that was asked for and may not be played
- [x] 3.3 The ask card: names the ground pressed; signed out, Sign in first and Ink+ second; the school row's chip says Sign in when signed out; the way back from joining names the ground pressed
- [x] 3.4 In the browser, signed out: the hill plays, each other ground shows its card, `/conga/play?map=columbia` lands on the hill with Columbia's card showing
- [ ] 3.5 The founder looks at the locked card's words on localhost, phone and laptop

## 4. Finish

- [x] 4.1 Run the Conga tests that cover the changed files
- [x] 4.2 `scripts/conga-perf.js` gives itself a player with Ink+, so it can still measure any ground

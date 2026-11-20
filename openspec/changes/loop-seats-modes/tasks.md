## 1. The game

- [x] 1.1 Mockup of the three modes, picked by the founder (`public/demo/mockups-seats-game.html`)
- [x] 1.2 `components/doodles/seats-game.ts`: Chart, Table and Who moved? on one clock, the 2 second charge, the stop at 60 seconds
- [x] 1.3 "You": the Ink+ member's own animals, the ask for everyone else, the choice kept in the browser
- [x] 1.4 The best kept per mode, and the one line the Doodles shelf shows
- [x] 1.5 Styles in the school's colours, a laptop layout and a phone layout, reduced motion

## 2. The page

- [x] 2.1 `app/c/doodles/seats/page.tsx` with the app's bar and foot; `/seats` redirects to it
- [x] 2.2 The shelf's ticket points at the new page and says what the game is now
- [x] 2.3 Remove the plain page and its test

## 3. Checks

- [x] 3.1 Tests for the modes, the stop at a minute, the look between rounds, the hint and "You" (`components/doodles/seats-game.test.ts`)
- [x] 3.2 All three modes played through in a browser on localhost, laptop and phone widths
- [ ] 3.3 Founder's yes on localhost, then the PR to main
- [ ] 3.4 Founder's word on whether Seats still says "In the works"

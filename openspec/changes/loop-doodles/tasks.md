## 1. The page

- [x] 1.1 `lib/campus/doodles.ts`: the list of games, which are out, and `doodlesFor(admin)`
- [x] 1.2 Tests in `components/campus/doodles.test.tsx`: a visitor sees what is out; the admin sees staged ones marked, with "Try"; the best is said only when kept
- [x] 1.3 `components/campus/doodles.tsx` and `doodles.css`: tickets on a rail, the name on an ink plate, the pictures in CSS
- [x] 1.4 `app/c/doodles/page.tsx`: the bar, the rail, the foot; open to signed-out visitors

## 2. The bar

- [x] 2.1 "Conga" in the top bar becomes "Doodles", marked when it is the page; the bar test follows

## 2b. Seats, in the works

- [x] 2b.1 `public/seats/index.html` served at `/seats`: the footer ticket with seats, a way back, "In the works"
- [x] 2b.2 Seats is out in the list, marked as in the works; its ticket says so

- [x] 2b.3 The game: seats of their own, "Kick them out", the clock, 2 seconds for a wrong seat, the best time kept and shown on the Doodles ticket
- [x] 2b.4 Played through in a headless browser at desktop and phone width: a wrong seat, every right seat, the best kept, a new round

- [x] 2b.5 Flourishes: the bob, the jolt, the landing, "+2s", the cheer, the ink drops, the stamp; nothing moves with reduced motion
- [x] 2b.6 `app/seats/route.ts` writes who is playing into the page; `proxy.ts` reads the sign-in for `/seats`; test in `app/seats/route.test.ts`
- [x] 2b.7 With Ink+ your own animal plays, with a spark, chosen from "You"; without, a pill to the Ink page
- [x] 2b.8 Played in a headless browser signed out, as someone with Ink+, and at phone width

## 3. Check it

- [x] 3.1 Tests, type check and lint
- [x] 3.2 The page as served to a signed-out visitor holds Conga and no staged game
- [x] 3.3 Looked at in a browser at desktop and phone width, signed out
- [ ] 3.4 The founder's yes to the name

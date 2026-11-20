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

## 3. Check it

- [x] 3.1 Tests, type check and lint
- [x] 3.2 The page as served to a signed-out visitor holds Conga and no staged game
- [ ] 3.3 Looked at in the browser at desktop and phone width, signed in as the admin
- [ ] 3.4 The founder's yes to the name

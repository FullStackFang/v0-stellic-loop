## 1. Show it at its real size first

- [ ] 1.1 Add `public/demo/mockups-footer-seats.html`: the footer ticket at full width with seats, beside the footer as it is today, opening with the animals on the floor
- [ ] 1.2 Draw it at phone width, and with every seat filled
- [ ] 1.3 Get the founder's answers to the four open questions in design.md, and his yes to the mockup

## 2. Seats in the footer

- [ ] 2.1 Tests first, in `components/campus/foot.test.tsx`: without the setting the footer's markup is unchanged; with it there is one seat per animal
- [ ] 2.2 Add `seats` to `SiteFoot` and draw the row of seats in the room (`components/campus/foot.tsx`, `foot.css`), the room taller if the mockup needed it
- [ ] 2.3 Give each animal a seat state in `crowdIn()`: seated ones are skipped by the floor and slope steps and drawn at their seat
- [ ] 2.4 Start them seated and let them leave one after another when the ticket is first seen; on the floor from the start with reduced motion
- [ ] 2.5 Letting go within reach of an empty seat seats the animal; picking a seated one up frees the seat; the seat a held animal is over is ringed
- [ ] 2.6 The pill sits on the top edge of the ticket, not the room, and reads "All in" when every seat is filled, and "Pick one up" otherwise
- [ ] 2.7 The idle hop and the cheer leave seated animals in their seats
- [ ] 2.8 "Drop them again": a pill on the top edge of the ticket, shown only when all are in, that empties the seats; the animals and seats stay hidden from screen readers and the button is not

## 3. Check it

- [ ] 3.1 Tests for each scenario in `specs/foot-seats/spec.md` that can be tested without a browser
- [ ] 3.2 In the browser at desktop and phone width: drop, throw, seat, tip the ticket, change colours, reduced motion
- [ ] 3.3 The crowd footer, with the setting off, looks and moves as before on This week, a groups page and the front door

## 4. Turn it on

- [ ] 4.1 Pass the setting on the pages the founder named in 1.3, and nowhere else
- [ ] 4.2 Add a "Seats" paragraph to the footer notes in `docs/loop-campus-design.md`

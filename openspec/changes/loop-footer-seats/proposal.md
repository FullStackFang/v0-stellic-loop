## Why

On 2026-11-20 the founder saw three directions for the error pages (`public/demo/mockups-error-pages.html`). He picked C, "the spill", for the error pages, and said of A, "the seats fell out": "i love the A) seats fell out, thinking if we can save that as an alternative footer option", pointing at the crowd ticket of the footer. This change writes that idea down so it can be built later without being worked out again. Nothing in it is built, and the footer the app has today stays as it is until he says otherwise.

## What Changes

- The footer's ticket gets a second way to be drawn, **Seats**, beside the one it has today (the crowd standing in the ticket, picked 2026-11-19 from `public/demo/mockups-footer.html`).
- In Seats the ticket has a row of round seats on its face. When the footer first comes into view the animals drop out of their seats and land on the floor of the ticket.
- An animal can still be picked up and thrown, as today. Dropped on an empty seat, it sits there.
- With every seat filled, the ticket says "All in" and shows a "Drop them again" button beside it, which empties the seats onto the floor once more (founder, 2026-11-20: "have some baked in the controls once it's over"). Taking one out by hand undoes "All in" too.
- The bar under the ticket (wordmark, Terms, Privacy, the copyright line, the colours) does not change.
- Which of the two the footer shows is one setting on the footer. It is the crowd, as today, unless the setting says Seats.
- With reduced motion the animals are already on the floor and nothing falls; they can still be seated.

Not in this change: turning Seats on anywhere, and anything that seating them all would give a person (a reward, a link, a count).

## Capabilities

### New Capabilities
- `foot-seats`: the Seats way of drawing the footer's ticket: the seats, how the animals leave them and are put back, what the ticket says when all are in, and how it behaves on a phone, with reduced motion and for a screen reader.

### Modified Capabilities

None. The footer has no spec of its own today, and nothing about the crowd ticket changes.

## Impact

- `components/campus/foot.tsx` and `components/campus/foot.css`: the ticket's markup and the crowd's physics gain seats. `components/campus/foot.test.tsx` gains tests.
- Every page that draws the foot (`SiteFoot`: This week, the groups pages, Admin, "Change a plan", the front door, sign-in) passes the setting or leaves it out.
- No database, no server code, no new dependency.
- The reference to build from: direction A of `public/demo/mockups-error-pages.html`, and a footer-sized frame of it to be added as `public/demo/mockups-footer-seats.html` before any code (see tasks).

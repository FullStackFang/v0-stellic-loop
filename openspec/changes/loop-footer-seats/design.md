## Context

The footer is `SiteFoot` in `components/campus/foot.tsx`: a ticket (`.cs-ft-tk`) with a room (`.cs-ft-stage`) where up to 13 animals stand, then a one-line bar. `crowdIn()` in the same file runs them: each animal has a place along the floor and a height above it, can be picked up and thrown, flips when poked, slides when the ticket is tipped, and cheers when the colours change. The loop stops when nothing moves or the ticket is out of view, and with reduced motion they stand still.

Direction A of `public/demo/mockups-error-pages.html` is a different, smaller model: a few round bodies under gravity that bump into each other, and seats on the ticket that an animal snaps into when dropped within about 34px of one. The founder liked what that one does. This design says how to get it into the footer without throwing away what the footer already does.

## Goals / Non-Goals

**Goals:**
- Seats is the footer the founder has today, plus seats: the same ticket, the same animals, the same picking up and throwing.
- The crowd footer is untouched when the setting is off: no change to what it draws or how it moves.
- One model of movement in the file, not two.

**Non-Goals:**
- Replacing the crowd footer, or showing Seats anywhere, in this change.
- Giving anything for seating them all.
- Bringing the mockup's bumping-circles model into the app.

## Decisions

**D1. One setting on `SiteFoot`, off by default.** `SiteFoot` takes `seats?: boolean`. Left out, the footer is exactly today's. A page turns Seats on by passing it. Why not a site-wide switch (an environment setting, a stored preference)? The founder has not said where it should show; a prop lets one page try it, and a wider switch can be added in one place later.

**D2. Seats are added to the room, not to a new ticket.** The row of seats sits along the top of `.cs-ft-stage`, above the animals' heads, the same count as the animals that fit (the count is already worked out from the room's width). The stub (`.cs-ft-tear`) keeps "Admit everyone" and its bars. "All in" is said by the pill that says "Pick one up" today. Why not the mockup's small ticket with a headline? The footer ticket is wide and has no headline; the founder asked for this ticket to do it.

**D3. Keep the footer's own model of movement.** `crowdIn()` already has falling, a floor, throwing and a roof. Seats adds one state to an animal, `seat: number | null`. A seated animal is skipped by the floor and slope steps and drawn at its seat. Letting go of a held animal within reach of an empty seat seats it; otherwise it flies as today. Picking up a seated animal unseats it. Why not the mockup's model? It has no slope, no places along the floor and no ticket to tip, so using it would lose three things the founder approved in the footer.

**D4. How they come to be on the floor.** Today the animals drop into the room from above the first time it is seen. In Seats they start in their seats and leave them one after another, a quarter of a second apart, when the room is first seen. With reduced motion they start on the floor.

**D5. Tipping the ticket.** A seated animal stays seated when the ticket is tipped or pulled. Only those on the floor slide. Why: a tip that empties the seats would undo the person's work with one drag, and the mockup has no tipping to copy.

**D6. Restlessness and cheering.** The idle hop every 2.6 seconds and the cheer on a colour change apply to those on the floor only. A seated one does a small bob in its seat for the cheer.

**D7. Screen readers and keys.** The ticket is decoration today (`aria-hidden`) and stays so in Seats. Nothing in it is needed to use the site, so there is no keyboard way to seat an animal.

**D8. Phone.** Under 860px the stub is hidden today and the room is narrower. Seats keeps the same rule; the seats are 44px so a thumb can drop on one, and the row holds as many as there are animals (at least 4).

## Risks / Trade-offs

- [The room is 132px high: seats above the animals may crowd it] → The mockup step (task 1) draws it at real size first; the room may need to grow to about 170px in Seats only.
- [`crowdIn()` is one long function and gains a state] → The seat rule is a few lines at three points (the step, letting go, picking up); tests cover the crowd footer staying as it is.
- [A thing that looks like it should give something for finishing, and gives nothing] → "All in" is the whole of it for now; the founder is asked below whether it should lead anywhere.

## Open Questions

For the founder, before this is built:
1. Where does Seats show: every page, or only some (the front door, This week)?
2. Does it take the place of the crowd footer, or do both stay, on different pages?
3. Does seating them all do anything beyond the pill saying "All in"?
4. Do the animals leave their seats every time the page is opened, or is "all in" kept for that person on that browser?

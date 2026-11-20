## Context

Two copies of the crowd ticket exist today:

- **The foot.** `components/campus/foot.tsx` draws the ticket (`.cs-ft-carry > .cs-ft-tk`: the stage with the crowd, the tear with "Admit everyone") above the bar, and `crowdIn()` runs the full physics: throw, poke, look at the pointer or a hovered link, tip the ticket, cheer on a colour change, idle hops, rest when out of view.
- **Seats.** `public/seats/index.html`, a plain page at `/seats`, listed in `lib/campus/doodles.ts` as out and in the works. Its script says it is "the crowd of the live footer, cut down to what seats need": floor, fall, throw, no overlap. On top of that it has seats and a round (look, kick them out, put each back in its own seat against the clock, best kept under `seats-best`).

The founder picked folding the crowd into Seats over a third ticket on the shelf.

## Goals / Non-Goals

**Goals:** a foot that is the bar alone; Seats with everything the crowd could do that makes sense off the footer; one copy of the crowd's physics.

**Non-Goals:** changing the Seats round or scoring; a Doodles ticket change; moving Seats off a plain page; the bar's look.

## Decisions

**D1. Port into the plain page, not the other way.** Seats stays a plain HTML page, as Conga is (`loop-doodles` D7). The crowd's behaviours are written into its script from `crowdIn()`. Alternative: turn Seats into a React route reusing `crowdIn()`. Rejected: it moves a game the founder already has working onto a new footing, for code that is deleted from the foot in the same change anyway. After the move there is still one copy.

**D2. The crowd acts on animals out of their seats only.** A seated animal is part of the round's state and stays put: no poke, no hop, no slide when the ticket tips. During "Remember who sits where" and "All in" everyone is seated, so the crowd is still there to look at but quiet; looking toward the pointer applies to the seated ones too, as a turn of the head only.

**D3. Poking is a press with no pull.** Today Seats only lets an animal be picked up during a round. A press that does not move more than a few pixels becomes a poke (a flip, the ones beside it hop), as in the foot. A pull still picks it up, and only during a round, so the round's rules do not change.

**D4. Tipping the ticket stays a mouse-and-pen thing.** As in the foot, touch scrolls the page (`touch-action: pan-y`); the ticket is picked up with a mouse or pen, on the paper and not on an animal or a pill. Tipped, animals on the floor slide to the low end; seated ones do not.

**D5. What stays behind.** Looking at a hovered footer link and the cheer on a colour change belong to the bar and have nothing to point at on Seats. They are dropped, not ported.

**D6. Reduced motion is as before.** With reduced motion nothing hops, slides or tips; the round still plays (Seats already places them on the floor at once).

**D7. The foot keeps its bar as is.** `SiteFoot` keeps its props (`home`, `kit`) and the colour dots; only the ticket, `crowdIn()`, and the state it needed (`count`, the layout effect that measured the stage) go. The `.cs-ft` top padding that made room for the ticket is checked against the bar alone.

**D8. `loop-footer-seats` is removed, not archived.** Nothing in it was built; archiving would put a footer-seats spec into `openspec/specs` that describes nothing. Its mockup `public/demo/mockups-footer-seats.html` stays, as Seats' reference.

## Risks / Trade-offs

- [The foot loses its one playful thing, chosen on 2026-11-19 ("this is perfect, keep this")] → the founder asked for the move; the toy is one press away on Doodles, and the bar was liked on its own ("i love this ... as the footer overall").
- [Pokes and tips during a round could knock animals around and slow the player] → they only touch animals that are already out, and the player chose to do them; the clock is unchanged.
- [The Seats script grows] → it takes on roughly what `crowdIn()` had, and `foot.tsx` loses more than that.

## Open Questions

1. Should the front door's foot, which wears the school's colours, still have anything above the bar? This change says no: the same bar everywhere.

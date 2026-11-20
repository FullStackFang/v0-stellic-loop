## Why

The foot of every page opens with a ticket holding the animal crowd ("Pick one up", "Admit everyone"), picked 2026-11-19 from `public/demo/mockups-footer.html`. Since then the ticket has a home of its own: Seats, a doodle at `/seats` (`openspec/changes/loop-doodles`), which is that same ticket with seats and a game against the clock, running a cut-down copy of the footer's physics. On 2026-11-20 the founder asked to move the crowd ticket "out of the footer and into doodles". With two copies of one ticket, the toy belongs where the games are, and the foot can be the bar.

## What Changes

- **The foot loses its ticket.** `SiteFoot` draws only the bar: wordmark, Terms, Privacy, the copyright line and, where the page has no colours of its own, the colour dots. Every page that has the foot today keeps it.
- **The crowd folds into Seats, not a new doodle** (founder, 2026-11-20, picked over a third ticket on the shelf). Seats keeps its seats and its round; an animal that is out of its seat now behaves as the footer's crowd did:
  - it is poked for a flip, and those beside it hop;
  - it looks toward the pointer, and leans into a run;
  - it slides and piles up when the ticket is tipped, and the ticket can be picked up with a mouse or pen;
  - one gets restless now and then, while the page is left alone.
- What the crowd did only because it sat in the footer does not move: looking at a hovered footer link, and the cheer when the colours change (Seats has neither links nor colour dots).
- Seats stays "In the works", out for everyone, at the same address. Its ticket on Doodles does not change.
- `openspec/changes/loop-footer-seats` (Seats as a second way to draw the footer, never built) is withdrawn: its footer no longer has a ticket.

Not in this change: a new doodle, a crowd anywhere else in the app (the front door's ticket, the loaders), and changing what the Seats game asks of the player.

## Capabilities

### New Capabilities
- `site-foot`: what the foot of a page holds (the bar alone) and where it is drawn.
- `seats-crowd`: how the animals in Seats behave while they are out of their seats: poke, look, tip the ticket, idle hops, and reduced motion.

### Modified Capabilities

None in `openspec/specs/`. The Doodles requirements (`loop-doodles`, not yet archived) are unchanged: Seats is still a ticket on the shelf, in the works, with a way back.

## Impact

- `components/campus/foot.tsx`: the ticket markup and `crowdIn()` (about 150 lines) are removed; `foot.css` loses the ticket's rules. `foot.test.tsx` gains a check that there is no ticket.
- `public/seats/index.html`: its physics gains the crowd's behaviours, ported from `crowdIn()`. After the move there is one copy of the crowd's physics, not two.
- The pages that draw the foot (This week, the groups pages, Admin, Doodles, Ink pages via `siteBar()`, legal pages, the front door and sign-in) need no change; they become shorter by the ticket.
- `openspec/changes/loop-footer-seats` is removed.
- No database, no server code, no new dependency.

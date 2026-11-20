## Why

Loopd has one game, Conga, with its own link in the top bar, and a second idea the founder wants kept ("the seats fell out", `openspec/changes/loop-footer-seats`). On 2026-11-20 he asked for "a shelf for games", as "something you can play while you wait for groups to form", with room to stage one before it is out. A link per game in the bar does not hold more than one, and there is nowhere to stage.

## What Changes

- A new page, **Doodles**, at `/c/doodles`, holds the games. Each is a ticket on a rail: the game moving on its face, its name on a tilted ink plate, Play on the stub (direction A of `public/demo/mockups-games-shelf.html`, with the name plate of B; founder, 2026-11-20: "love A", "i like the way the name is splattered across").
- The top bar's "Conga" link becomes "Doodles" and leads there. Conga itself stays at `/conga`.
- A game is either out or staged. A staged one is on the page for the admin alone, greyed and marked, with "Try" in place of "Play". Putting it out is one word in `lib/campus/doodles.ts`.
- Seats is the first staged one. "Try" opens its mockup; it is not a game yet.
- The page is open to signed-out visitors, as Conga is.

Not in this change: a game offered on an event or idea card (founder: "that would be distracting for now"), Seats as a real game, and an admin switch for putting a game out.

The name: the founder asked for something "ink themed or loopd themed" in place of "Games". Doodles was the suggestion he answered "love it" to. It is one word in the bar and the page title if he wants another.

## Capabilities

### New Capabilities
- `doodles`: the page that holds the games, what a ticket shows, who sees a staged one, and the bar's link to it.

### Modified Capabilities

None.

## Impact

- New: `app/c/doodles/page.tsx`, `components/campus/doodles.tsx`, `doodles.css`, `doodles.test.tsx`, `lib/campus/doodles.ts`.
- `components/campus/top-bar.tsx`: the Conga link becomes Doodles. `app/c/site-bar.tsx` and `components/campus/screen.tsx`: the bar can mark it as the page.
- No database, no migration, no new dependency.

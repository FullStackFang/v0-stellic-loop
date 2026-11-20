## Why

Seats was one round on a ticket: kick them out, put each back. The founder found it thin and picked, from
`public/demo/mockups-seats-game.html`, one game with three modes that each play differently, on a page that carries the
app's bar and foot instead of standing alone with white space round it.

## What Changes

- Seats has three modes on one clock, in this order: **Chart** (a matching game: flip two tiles to find a pair),
  **Table** (each chair has a colour and the chairs turn after the kick, so each goes back by colour) and **Who moved?**
  (the lights go out, some swap seats, tap the ones that moved; five rounds with a look between them).
- A mistake costs 2 seconds in every mode. The clock stops at 60 seconds and the round is lost.
- The best is kept per mode; the Doodles shelf shows the fastest of the three and its mode.
- "You" is a pill in the game. With Ink+ it opens the member's own animals and the one picked plays in every mode;
  without, it opens what Ink+ gives. Ink+ also puts the app's ink blot on the back of Chart's tiles and over the
  ticket when the lights go out.
- **BREAKING** Seats moves from the plain page at `/seats` to a page of the app at `/c/doodles/seats`, with the bar and
  the foot. `/seats` redirects there.
- The old ticket round is gone, and with it the crowd's play (poking, tipping the ticket, restlessness).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `doodles`: Seats is three modes on one clock on a page of the app; the round, the Ink+ animal and what the game shows change with it.
- `seats-crowd`: removed. The crowd ticket it described is no longer in Seats.

## Impact

- `components/doodles/` (new): the game (`seats-game.ts`, drawn by hand into one element), its styles, a small client component.
- `app/c/doodles/seats/page.tsx` (new), `app/seats/route.ts` (now a redirect), `lib/campus/doodles.ts` (where Seats is, its line).
- Removed: `public/seats/index.html`, `app/seats/route.test.ts`.
- Browser storage: `seats-best-a`, `seats-best-c`, `seats-best-t` per mode; `seats-best` now reads like "6.6s, Chart"; `seats-own` as before.

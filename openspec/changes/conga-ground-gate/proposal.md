## Why

Conga's grounds are meant to be a school's own: you play your school's ground free and go on its board, and another school's ground comes with Ink+. Today that only holds for someone signed in whose school has a ground. Someone signed out, and someone signed in whose school has no ground yet, can play every ground (`mineSchool()` in `public/conga/index.html` and the same rule in `saveBest()`), so the lock is not seen by exactly the people it is for. The founder is an admin, who has every ground, which is why the picker looked open to him.

## What Changes

- **BREAKING (for visitors):** one ground, Cornell's hill, where Loopd began, is open to everyone. Someone signed out, or signed in with no school that has a ground, plays that ground only; until now they could play every ground.
- Every other ground is shown to them locked, never hidden. Pressing one says the way in: signed out, sign in first (free if it is their school) and Ink+ second; signed in, Ink+.
- A ground asked for by address (`?map=`) or kept from an earlier visit that the player may not play opens the ground they may play instead, with the picker showing why.
- One rule decides who may play what, written once and read by both the game and the server, so the picker and the board cannot disagree.
- The board keeps a round only on a ground its player may play (as now, with the new rule).
- Unchanged: a player's own schools' grounds are free; Ink+ and admins play every ground; someone signed out is never kept on a board.

## Capabilities

### New Capabilities

- `conga-grounds`: who may play which Conga ground, what a locked ground shows, and which rounds a board keeps.

### Modified Capabilities

None.

## Impact

- `public/conga/maps.js` (the rule and the open ground's name), `public/conga/index.html` (`mineSchool`, `free`, `places()`, the ask card, the ground chosen at load), `lib/campus/conga-board.ts` (`saveBest`), their tests (`lib/campus/conga-board.test.ts`, `app/conga/sim.test.ts`, `app/conga/play/route.test.ts`).
- The Play links on each campus's Doodles page (`/c/doodles`) carry `?map=`; for a stranger on another school's page that link now lands on the open ground, with the picker open on the school they asked for.
- No database change. The game's files are public, so this gates the picker and the board, not the map data itself.

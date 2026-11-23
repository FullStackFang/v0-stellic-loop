## Why

Conga's script takes about 2 ms of each 16.7 ms frame, and the stutter at the start of a round is fixed (commit `cff4c3f`). What is left are short hitches that come from how the page draws, not from how much it draws: the draw loop makes thousands of short-lived objects a second (one 41 ms garbage-collection pause was measured in 70 s of play), a sharp desktop screen is painted at up to four times the pixels of a plain one, and a few small things do work every frame that only needs doing when something changes. These are standard game-loop fixes, each small, each measurable.

## What Changes

- A kept measuring script (`scripts/conga-perf.js`) that plays scripted rounds and reports the longest stretch of script, the time spent collecting garbage, and the frame gaps. Every change below is measured with it before and after. The scripts used for `cff4c3f` were thrown away; this one is kept.
- Less garbage, in the order the measuring script names it: no `Math.hypot` in the hot loops, arrays made once instead of per step, nothing worked out for lines and stops out of view, no point made per piece of rope.
- The canvas is asked for opaque (`alpha: false`), so the browser does not blend it with the page behind.
- The scoreboard's HTML is built only while it is open and written only when it has changed.
- The toys' sheet is decoded before its first draw, as the animals' sheet already is.
- Waiting on the founder, not built: a budget of pixels for large sharp screens, which softens the picture a little there.
- Dropped after review (design.md, After the review): the trail as a ring buffer, a text width cache, quality stepping back up, a fixed step for the rules.

Nothing in the rules of the game or the look changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conga-smoothness`: adds requirements for the kept measuring script, the start of a round, garbage made while playing, work skipped out of view, and the scoreboard written only on change.

## Impact

- `public/conga/index.html` (draw loop, `fit()`, `board()`, `pill()`, `plaque()`, `arcText()`, `beam()`, `hopBus()`, the quality step in `frame()`).
- `public/conga/sim.js` (`path` storage in `step()` and `follow()`; its tests in `app/conga/sim.test.ts` must pass unchanged).
- New `scripts/conga-perf.js`. No database, no route, no dependency added.

## Context

`public/conga/index.html` draws the game on one canvas. Since the first pass, `ground()` paints the static ground and `carpet()` lays it from 512-pixel squares (`kept`), each painted once by `patch()`. The squares are keyed by ground, scale and sharpness, and thrown away when any of those or the font changes.

Measured on the first pass (Snapdragon X laptop, headless Chrome, frozen scene of about 650 animals): 10 ms a frame at 2880×1800, of which ropes are about 5 ms; 2.5 ms at 780×1688. Real play held 60 frames a second with no lost frame while walking, at 1440×900 and at phone size with the processor slowed four times.

The review (second agent, read-only) confirmed one defect by working the numbers and raised three risks it could not measure.

## Goals / Non-Goals

**Goals:**
- Fix the shore stitch break.
- Bound the memory the kept ground holds, and never freeze if a square cannot be made.
- Know, by measurement, whether new squares cost frames on large screens; act only if they do.
- Make ropes cheaper without changing their look.
- Stop repainting a paused game.

**Non-Goals:**
- A new rope look. That is the founder's pick from the mockup.
- Baking the felt fibres or the bridges into the squares. Neither showed a cost.
- Raising sharpness back up after it has stepped down.
- Any change to `sim.js`.

## Decisions

**D1. The bank's stitch starts from a fixed point.** In `banks(cx, cy, reach)` the stitched rectangle's top is `vy - reach - 70`, which differs per square, so the dash phase does too. Snap that top down to a multiple of the dash period (18 units) in the bank's own frame. Alternative: draw the two long sides as separate lines from the bank's end. Rejected as more code for the same result.

**D2. The ceiling follows the view.** Evict when `kept.size` passes twice the count of squares in view this frame (at least 40), keeping the ring of two round the view. A fixed 120 is too many for a phone (20–25 in view) and too few for a 2560×1440 screen (160+ in view, so eviction never ran). On dropping a square, set its canvas `width = 0` so Safari gives the memory back at once. Alternative: one large canvas per view. Rejected: the view's zoom changes every frame.

**D3. A square that cannot be made falls back.** If `getContext('2d')` returns null in `patch()`, clear `kept`, and paint this frame with `ground()` directly as before the first pass. A frame is slow, the game does not stop. `frame()` already asks for the next frame last, so an exception anywhere in drawing ends the game: the fallback removes the one new way that could happen.

**D4. Measure new squares before changing them.** Add the two large screens to the real-play script and record the worst frame gap while walking and while dragging the window's edge. Change only on a lost frame, in this order: drop the 80-unit margin from the range `carpet()` covers; paint at most a few squares a frame beyond the ones in view; 1024-pixel squares. Each is tried alone and re-measured.

*Measured (2026-11-21, machine at 90–100% CPU from other sessions):* dashing lost some frames, but nearly none followed a frame that painted a square, so the three remedies above were not applied. Resizing was the real loss: the squares' scale followed the window's size, so every new size threw all of them away and repainted 35–84 in one frame. The scale is now rounded up to steps of 2^(1/8) (about 9%), so a dragged edge crosses a step now and then. Squares are never softer than the screen needs, and at most about 19% more of them are in view.

**D5. A rope is stroked only where it is on screen.** `rope(points, ...)` is given the runs of `shown` that are in view, each widened by one point at both ends so the curve enters the screen as it does now. The dash phase is carried from one run to the next by the length skipped, so the twist does not jump as a rope comes into view. Alternative: one stroke for the two dashed passes. Rejected here: it changes the look.

**D6. A paused game repaints only when stale.** One flag, `stale`, set by `fit()`, the toy sheet's load, the font's `loadingdone`, `open()` and `pause()`. `frame()` skips `draw()` when `paused && !stale`, and skips the `pace` update on a skipped frame so a pause cannot lower the sharpness. The small map and the scoreboard already follow the frame count and stop with it.

## Risks / Trade-offs

- [The dash phase carried across runs (D5) drifts by a pixel as a rope bends] → compare screenshots of the frozen scene before and after; if it shows, stroke the dashed passes over the whole rope and trim only the solid ones.
- [The paused picture is stale after something not on the list (D6)] → the list is every writer of what `draw()` reads apart from time; a resize is the common one and is covered.
- [Other sessions are editing the same file] → small edits with the Edit tool, commit by path, and only when the file holds no half-done work of theirs.
- [Measurements are from one laptop's graphics chip] → the same two scripts, same scene and seed, before and after each task; a real phone is tried by the founder.

## Open Questions

- Whether the founder has picked a rope from `/demo/mockups-conga-rope.html`. If so, that look replaces the strokes in D5 in its own change.

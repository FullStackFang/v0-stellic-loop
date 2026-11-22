## Why

Conga's ground is now painted once and kept in squares, which took a frame on a laptop-size screen from 31–44 ms to about 10 ms. An independent review of that change found one visible defect and three risks it did not have before, and two costs were left alone on purpose: the ropes (about half of what a frame still costs) and a paused game that repaints the same picture 60 times a second.

## What Changes

- **Shore stitch across squares.** The stitch along the far banks (Roosevelt Island ground) starts from each square's own middle, so it breaks where two squares meet on laptop-size screens. It starts from a fixed point instead.
- **Kept ground has a ceiling.** Squares are let go once they pass about twice what is in view, instead of a fixed 120, and a dropped square gives its memory back at once. If a square cannot be made, the ground is painted the old way for that frame and the game carries on.
- **New squares never cost a frame.** Measured first on a 1920×1080 and a 2560×1440 screen at full sharpness. Only if a frame is lost: fewer, larger squares, or a limit on how many are painted in one frame.
- **Ropes cost less with the same look.** Only the part of a rope that is on screen is drawn. Any change to how a rope looks goes through `/demo/mockups-conga-rope.html` and the founder's yes, and is not part of this change until picked.
- **A paused game does not repaint.** It repaints once when something changes under it: the window is resized, the toys or the font arrive, the ground is switched, or the pause is lifted.

Nothing here changes the rules of the game or how it looks.

## Capabilities

### New Capabilities
- `conga-smoothness`: what Conga's drawing must hold to: the ground kept and bounded, no lost frames from new ground, ropes drawn only where seen, and no repainting while paused.

### Modified Capabilities

None.

## Impact

- `public/conga/index.html` only: `banks`, `patch`, `carpet`, `rope` and its caller in `draw`, `frame`, `fit`, `pause`.
- The file is shared with other sessions' work on roads and ropes: edits are small and made by path.
- No server code, no database, no dependency.
- Measured with the two scripts used for the first pass (frozen-scene cost and real-play smoothness), kept outside the repo.

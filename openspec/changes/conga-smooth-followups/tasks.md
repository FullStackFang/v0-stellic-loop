## 1. Before anything: the page as it stands

- [x] 1.1 Confirm `public/conga/index.html` holds no half-done work from another session (`/no-collisions`), then commit the first pass (kept ground, sharpness clamp) by path
- [x] 1.2 Re-run the frozen-scene and real-play scripts on both grounds and write the figures down as the baseline for this change

## 2. The far bank's stitch (D1)

- [x] 2.1 Screenshot the Manhattan and Queens shore at 1440×900 and 1920×1080 and confirm the break at the joins between squares
- [x] 2.2 In `banks`, snap the stitched rectangle's top to a multiple of the dash period in the bank's own frame
- [x] 2.3 Screenshot again at both sizes and at phone size: the stitch runs unbroken

## 3. A ceiling on the kept ground (D2, D3)

- [x] 3.1 Count the squares in view in `carpet` and evict when `kept.size` passes twice that (at least 40), keeping the ring of two
- [x] 3.2 Set a square's canvas `width = 0` wherever it is dropped: eviction and every `kept.clear()`
- [x] 3.3 In `patch`, when the canvas gives no context: clear `kept` and return nothing; `carpet` then paints that frame with `ground()` directly
- [x] 3.4 Check by forcing the null path once from the console: the game keeps running and the ground is still drawn
- [x] 3.5 Check the count kept after walking the whole ground at phone size and at 2560×1440

## 4. New squares and lost frames (D4)

- [x] 4.1 Add 1920×1080 and 2560×1440 at full sharpness to the real-play script; record the worst frame gap and the squares painted per frame while dashing for ten seconds, and while the window is resized
- [x] 4.2 If no gap passes 25 ms, stop here and note the figures (gaps did pass 25 ms, on a machine at 90-100% CPU; see design D4)
- [x] 4.3 Otherwise try, one at a time and re-measured: no 80-unit margin in `carpet`'s range; at most a few squares painted a frame beyond those in view; 1024-pixel squares (not applied: dash gaps did not follow square painting; resize did, fixed instead by a stepped square scale, see design D4)

## 5. Ropes only where seen (D5)

- [x] 5.1 Check whether a rope has been picked from `/demo/mockups-conga-rope.html`; if so stop and raise it, since that look changes these strokes (none: the mockup was dropped, the yarn rope stays)
- [x] 5.2 In `draw`, cut each line's `shown` into the runs in view, each widened by one point at both ends, and stroke each run (a piece is in view when the box round its three animals meets the view)
- [x] 5.3 Carry the dash phase from run to run by the length skipped
- [x] 5.4 Compare the frozen scene's screenshot before and after: colour, width, twist and shadow unchanged (same frame in-page: 0 px differ on desktop, 4 on phone; a 240-animal rope mostly off its canvas: 0.6% of pixels differ by at most 36/255, the twist's strands a fraction of a pixel along)
- [x] 5.5 Measure the frozen scene with long lines mostly off screen, before and after (machine at 70-100% CPU: whole vs runs on one frame, phone 2.3-5.8 vs 2.7-3.2 ms, desktop within noise; long-line scenes drift as owed animals step in)

## 6. No repaint while paused (D6)

- [x] 6.1 Add `stale`, set by `fit`, the toy sheet's load, the font's `loadingdone`, `open` and `pause` (also the animal sheet, own pet and pickup pictures)
- [x] 6.2 In `frame`, skip `draw` and the `pace` update when paused and not stale; clear `stale` after a draw
- [x] 6.3 Check: paused and left alone draws nothing (count canvas calls); a resize while paused draws once; sharpness is the same after a one-minute pause (0 calls in 180 frames; 1 frame drew after a resize; canvas 2880 wide before and after a 60 s pause)

## 7. Close

- [x] 7.1 Run `app/conga/sim.test.ts` and `app/conga/route.test.ts` (15 passed)
- [x] 7.2 Re-run both scripts on both grounds and set the figures beside the baseline from 1.2 (frozen scene at 2880×1800: Roosevelt Island 14.3 → 12.1 ms, Cornell 10.0 → 6.1 ms; real play within noise, the machine at 70-100% CPU from other sessions both times)
- [x] 7.3 Commit by path on local main (the page's code went into f7247d0 with another session's spill work; this change's files committed by path)

## Context

The game is one page (`public/conga/index.html`, about 1,900 lines) drawing on a 2D canvas, with its rules in `public/conga/sim.js`. Earlier work (`conga-smoothness` spec) already keeps the static ground in painted squares, skips what is off screen, strokes only the rope in view and stops drawing while paused.

Measured on 2026-11-23, 1920×1000, one pixel to the point, Columbia ground, headless Chrome on the founder's machine:

- Script per frame: about 2 ms at the middle, 6 ms at the 99th percentile.
- Before `cff4c3f`, each Start or Again cost 70–125 ms; after, about 4 ms.
- In 70 s and 5 rounds after that fix, the only stretch of script over 25 ms was a 41 ms garbage-collection pause. Collector time was 63 ms in a 25 s run.
- Self time in a 25 s run: `drawImage` 519 ms, `step` 322 ms, `draw` 224 ms, `follow` 160 ms, `inside` 154 ms, `fillText` 55 ms, `measureText` 34 ms, `arcText` 65 ms, `addColorStop` 48 ms, `board` 28 ms.

Not measured: a high-density desktop screen (the measuring browser is one pixel to the point), a signed-in player, a phone.

## Goals / Non-Goals

**Goals:**

- No pause from the garbage collector long enough to lose a frame during ordinary play.
- A large sharp screen costs about what a laptop does.
- Every change proven by the same script, before and after.

**Non-Goals:**

- WebGL, a game engine, a worker for the rules, OffscreenCanvas. The script is 2 ms a frame; none of these pays for its rewrite.
- Splitting the page into modules. Good for upkeep, nothing for smoothness; a change of its own if wanted.
- Any change to the rules, the art, or the cards.

## Decisions

**D1. A kept measuring script first.** `scripts/conga-perf.js` is a function for the Playwright tool (`browser_run_code_unsafe` with `filename`), as used for `cff4c3f`. It opens `/conga/play?map=<ground>` at a given size, plays scripted rounds (steering in a wandering circle, ending a round by moving the head onto another line through `window.conga.world`, pressing Again from inside the page), and reports: frame gaps over 25 ms, script time per frame, every stretch of script over 25 ms with the functions in it (CPU profile), and total collector time. One run is about 75 s. Wall-clock frame gaps on this machine are noisy (other sessions run on it), so the pass marks are the CPU-profile numbers; frame gaps are reported, not judged. *Instead of* adding Playwright to `package.json`: the tool is already there and the script is run by hand a few times per change.

**D2. Garbage: reuse, do not rebuild.** In `draw()`:

- `shown`, `sprites`, `heads`, `mobTags`, `dusts` become arrays kept between frames and refilled (`length = 0`, then written by index into pooled objects), not rebuilt with new objects and spreads per animal.
- `beam()`'s per-glint `createRadialGradient` and `hopBus()`'s per-tyre gradient become one small canvas each, made once (a white soft dot, a dark soft dot), drawn with `drawImage` and `globalAlpha`. The `[[r, 0], [0, r], …]` array made per glint becomes four plain calls.
- Colour strings built per call with a changing alpha (`oklch(… / ${a})` in smoke, wisps, glints, `foot()`) become a fixed `fillStyle` with `globalAlpha`.
- `sim.js`: `line.path.unshift(…)` moves every element on each step. It becomes a ring buffer with a head index, read through one small accessor in `follow()` and `ropeLength()`. This is the one change inside the rules' file; `sim.js`'s tests and a recorded run (same seed, same events before and after) guard it.

*Instead of* object pools everywhere: only the sites the profile and a read of `draw()` show running per animal or per glint per frame. Order of work is by the profile's allocation sampling (D1 can add `HeapProfiler.startSampling`), biggest first, stopping when the pass mark holds.

**D3. Opaque canvas.** `canvas.getContext('2d', { alpha: false })`. Safe only if every frame paints every pixel. `draw()` lays the ground over the whole view (`carpet()` or `ground()`, which begin with the water or the table filled across the view), so it does; the task checks the `?at=` still view, a resize while paused, and the first frame before the pictures are in. *Not doing* `desynchronized: true`: it trades tearing for latency and is not honoured on most desktops.

**D4. A budget of pixels.** `fit()` today takes `dpr = min(SHARP[quality], devicePixelRatio)`. It becomes `min(that, sqrt(BUDGET / (wide × tall)))`, never under 1. With `BUDGET` about 4.4 million: a phone (390×844 at 2) and a 1280×800 laptop at 2 are untouched; 1440×900 at 2 (5.2 M) draws at 1.84; 1920×1000 at 2 (7.7 M) draws at 1.51; a one-pixel-to-the-point desktop is untouched. The kept squares already key on `scale`, which carries `dpr`, so they follow. Because it changes how sharp the picture is on some screens, the founder sees the same scene before and after at 1440×900 and 1920×1080 at two pixels to the point (a `/demo/mockups-conga-sharpness.html` page holding the two pictures side by side) and the number is his to move or refuse.

**D5. Work only on change.**

- `board()` builds its HTML string as now, compares it with the last one written, and writes only when different. The same for `mineCount` and `place`.
- A small `Map` from `font + text` to measured width serves `pill()` and `plaque()`; cleared on `document.fonts` `loadingdone` (the listener exists). Bounded by clearing at 500 entries: names and counts are few.
- `arcText()` (stop signs) is left as is unless the profile after D2 still shows it: it is drawn only for stops in view.
- `toys` gets `toys.decode()` before `toysIn()` can be true, as `sheet` has.

**D6. Quality steps back up.** Today `quality` only rises (worse). After 20 s with `pace` under 18 ms at a lowered quality, it steps back one, at most twice in a session, and never within 30 s of the last step either way, so it cannot flap. A step repaints the kept squares only when the scale changes (already so since `cff4c3f`).

**D7. Measure, then decide: fixed step for the rules.** The textbook loop steps the rules at a fixed rate and draws in between. Its gain here is smaller than it first looks: the browser's frame time is already tied to the screen's refresh, the rules already scale by the time passed, and a late frame already moves things the right distance. What it would add is the same number of rule steps on a 60 Hz and a 144 Hz screen, and identical rules on every machine. It costs storing and blending the last two positions of everything drawn. So: the measuring script records the head's on-screen movement per frame against the frame's length at 60 Hz and with the frame rate forced to 144; it is built only if movement is uneven by more than a pixel, or if rule steps at 144 Hz cost more than 1 ms a frame.

**D8. Measure, then decide: a walkable grid.** `inside()` and `within()` are about a third of the rules' time (0.15 ms a frame here). A grid of cells marked wholly on, wholly off or mixed would make most calls a lookup. It is built only if a phone-size run with the CPU slowed four times shows the rules over 3 ms a frame.

## Risks / Trade-offs

- [Reused objects carry stale fields: a sprite keeping last frame's `tilt`, `alpha`, `ink`] → every pooled object is written whole each frame through one function per kind; the frozen `?at=` scene is compared by picture before and after.
- [The ring buffer changes the order `follow()` reads the trail] → a recorded run with a seeded `random` must give the same events and the same tail positions before and after; `sim.js`'s tests unchanged.
- [Opaque canvas shows black where a frame does not paint] → the three cases in D3 are looked at; if any leaves a gap the table colour is filled first that frame.
- [The pixel budget softens a screen the founder likes sharp] → his yes on the side-by-side before it is kept; the budget is one number.
- [Quality stepping back up makes the squares repaint in the middle of play] → only after 20 steady seconds, at most twice, and D2 lowers the cost of the repaint.
- [The measuring machine is noisy] → pass marks use CPU-profile time, and each measure is the middle of three runs.

## Migration Plan

Each decision is its own commit on local main, measured before and after, so any one can be taken back alone. No data, no route, nothing to roll out.

## Open Questions

- The pixel budget (4.4 million proposed): the founder's call on the side-by-side.
- Whether a signed-in player's own-animal picture (drawn from a large image every frame as the head) is a cost: the measuring script cannot sign in. If the founder still sees bumps signed in, the head's picture is drawn once to a small canvas and that is used.

## After the review (2026-11-23)

A second agent checked this design against the code, and the kept measuring script was then run. What changed:

- **Not built: the trail as a ring buffer.** The trail gains an entry about 30 times a second, not every step, and is a few hundred entries long; moving it is noise, and `follow()` is the hot loop an accessor would slow. The seeded-run task that guarded it goes with it.
- **Not built: the text width cache.** Most of the measuring is `arcText()` on stop signs, which `stop()` draws every frame with no check that the stop is in view. Skipping stops out of view removes it; a cache would also miss on every frame of a megaphone's zoom on a phone.
- **Not built: quality stepping back up (D6).** Frame time is tied to the screen's refresh, so at a lowered quality it reads steady on exactly the devices that needed the step; a step up is then a blind try that costs a full repaint. Left as it is.
- **Not built: the fixed step (D7).** Its two triggers could never fire: movement per frame is the frame's length times a speed by construction, and a rule step costs the same at any refresh rate. Decided as no, with the known frame-rate differences (stray wander, the dash's dropped remainder, bots thinking once a step) left alone as harmless.
- **Waiting on the founder: the pixel budget (D4).** It cannot be judged by the script (the measuring browser is one pixel to the point, and the script times script, not painting). Its largest softening is a 4K monitor at 150%: 2560×1440 at 1.5 would draw at 1.09. It must be worded "no more than the larger of the budget and one pixel to the point", and the first quality step would do nothing on a capped screen. It is not built until he has seen it on such a screen and said yes.
- **Garbage, by measurement and not by the list in D2.** Allocation sampling on Columbia: about 16 MB a second, a quarter of it in `follow()`, an eighth in `Math.hypot` itself (the browser's hypot makes a list of its arguments on each call), then `step()`, `think()`, and the per-animal objects in `draw()`. So: `Math.hypot(a, b)` becomes a square root of a sum in the hot loops; the per-step array of headings and the per-think array of slices are made once; a line wholly out of view makes no per-animal objects; `rope()` stops making a point per piece; `beam()` does nothing when the lighthouse is far out of view; stops out of view are not drawn.
- **The scoreboard** is closed by default, so its HTML is not even built while it is closed, and is written only when changed while open.
- **Collector figures before:** 183 to 213 ms a minute, longest single pause 14 to 20 ms (Columbia, 1920×1000).
- **The rare long call.** A few times in about fifteen minutes of measuring, one canvas call (a rope's stroke, a line of text, a picture) took 100 to 370 ms. It did not follow what was drawn: ordinary play, the whistle and the megaphone were each run alone without it, and it came while other tabs were busy in the same browser. Treated as the measuring machine, not the game; not chased further.
- **After (2026-11-23, one run):** collector 103 ms a minute, longest pause 8 ms, memory made 6 MB a second, no stretch of script over 25 ms. What still makes memory: `step()` 28%, `think()` 19%, `follow()` 19%, `draw()` 11%.
- **The opaque canvas could not be measured here.** The measuring browser's frame rate swung between 30 and 60 with and without it, by what else the machine was doing. It is kept because every frame paints the whole canvas (checked: no unpainted pixel after a resize while paused) and it can only save the browser work; what it saves on the founder's screen is not known.

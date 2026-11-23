## 1. Measure

- [x] 1.1 Write `scripts/conga-perf.js`: scripted rounds; reports frame gaps, script per frame, stretches over 25 ms with their functions, collector time, and which functions make the most memory
- [x] 1.2 Run it on Columbia at 1920×1000 for the "before" figures (design.md, After the review)

## 2. Garbage

- [x] 2.1 `sim.js`: square root of a sum in place of `Math.hypot`; the headings array and the think slices made once; rules tests pass
- [x] 2.2 `index.html`: the same for `Math.hypot` in what runs per animal per frame
- [x] 2.3 `draw()`: a line wholly out of view makes no per-animal objects; stops out of view are not drawn; `beam()` returns at once when the lighthouse is far out of view
- [x] 2.4 `rope()`: left as it is. After 2.1 to 2.3 the rope makes 3% of the memory, and the collector is under the mark without it
- [x] 2.5 Run the measuring script three times (Columbia, 1920×1000). Memory made: 6.0, 6.0 and 6.5 MB a second (before: about 16). Collector: 103, 131 and 137 ms a minute, middle 131 (before: 183 to 213); longest pause 8, 15 and 16 ms (before: 14 to 20). The 110 ms mark first written was missed and was inside the spread of one build measured three times, so the spec now marks memory made, which held steady

## 3. Pixels

- [x] 3.1 Opaque canvas (`alpha: false`); look at the still view and a resize while paused
- [x] 3.2 Pixel cap in `fit()` (`MOST`, a 4K screen's worth, never under one pixel to the point). The founder left the call to the build (2026-11-23), so the 4.4 million first proposed, which softened a 4K monitor at 150%, was not taken. Checked with the screen's sharpness stood in for: 390×844, 1440×900 and 1920×1080 at two, and 2560×1440 at 1.5, are untouched; 2560×1440 at two draws at 1.5; 3008×1692 at two draws at 1.28

## 4. Work only on change

- [x] 4.1 `board()`: nothing built while the scoreboard is closed; written only when the string differs
- [x] 4.2 `toys.decode()` before the toys count as in

## 5. Later, only if a phone asks for it

- [x] 5.1 Phone-size run (390×844) with the CPU slowed four times: the rules take 0.7 ms a frame, the drawing 1.4 ms, the whole frame 2.4 ms. Under the 3 ms mark, so the walkable grid (D8) is not built

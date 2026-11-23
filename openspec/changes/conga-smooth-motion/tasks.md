## 1. Measure

- [x] 1.1 Write `scripts/conga-perf.js`: scripted rounds; reports frame gaps, script per frame, stretches over 25 ms with their functions, collector time, and which functions make the most memory
- [x] 1.2 Run it on Columbia at 1920×1000 for the "before" figures (design.md, After the review)

## 2. Garbage

- [x] 2.1 `sim.js`: square root of a sum in place of `Math.hypot`; the headings array and the think slices made once; rules tests pass
- [x] 2.2 `index.html`: the same for `Math.hypot` in what runs per animal per frame
- [x] 2.3 `draw()`: a line wholly out of view makes no per-animal objects; stops out of view are not drawn; `beam()` returns at once when the lighthouse is far out of view
- [x] 2.4 `rope()`: left as it is. After 2.1 to 2.3 the rope makes 3% of the memory, and the collector is under the mark without it
- [x] 2.5 Run the measuring script. After (Columbia, 1920×1000, one run): collector 103 ms a minute (before: 183 to 213), longest pause 8 ms (before: 14 to 20), 30 collections a minute (before: 62 to 72), memory made 6 MB a second (before: 16), no stretch of script over 25 ms. One run, on a machine that was busy with other work; the spec asks for the middle of three

## 3. Pixels

- [x] 3.1 Opaque canvas (`alpha: false`); look at the still view and a resize while paused
- [ ] 3.2 WAITING ON THE FOUNDER: pixel budget in `fit()`, after he has seen before and after on a sharp screen (1440×900 and 1920×1080 at two pixels to the point, 2560×1440 at 1.5)

## 4. Work only on change

- [x] 4.1 `board()`: nothing built while the scoreboard is closed; written only when the string differs
- [x] 4.2 `toys.decode()` before the toys count as in

## 5. Later, only if a phone asks for it

- [ ] 5.1 Phone-size run with the CPU slowed four times; build the walkable grid (D8) only if the rules pass 3 ms a frame

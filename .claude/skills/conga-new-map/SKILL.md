---
name: conga-new-map
description: Add a campus's ground to the Conga game (/conga): its areas, landmarks from OpenStreetMap, its own toy drawings, bots, shuttle, mascot, its row in the place picker and the Play link from that campus. Use when the founder asks for a Conga map or game for a school or campus (Columbia, NYU, CUNY...), or to change which landmarks stand on an existing ground or draw new ones.
---

# A new Conga ground

Conga's grounds are all in `public/conga/maps.js` (`MAPS`, keyed by the campus slug: the `slug` of the
`campus` table, e.g. 'cornell', 'cornell-tech', 'columbia', 'nyu', 'cuny'; `lib/__tests__/campus-listings.test.ts` lists them).
The page is `public/conga/index.html`, the rules `public/conga/sim.js`. Read the `conga-game` and `conga-new-campus-maps`
memories first: they hold what the founder picked and hated (no oval shadows under toys, no code-drawn landmarks, toys
must match the plush animals). Columbia (Morningside + Manhattanville) is the worked example: copy its shape.

## The rules that always hold

- **Every picture costs money.** List what you would draw and the cost (about 3.5c each) and wait for a yes. A past yes does not carry over.
- **A school's best-known places get their own toy.** The founder expects the landmark everyone knows (Columbia: Low
  Library, Alma Mater on its steps, Butler, the business school's halls) to look like itself, not a stock building.
  Reuse a stock toy (`public/conga/scenery.js` `AT`: dorm, brick hall, glass hall, chapel, subway entrance...) only for
  the ordinary halls, and say which are stand-ins.
- **A new ground is a look change.** Build it, give the founder `http://localhost:3000/conga?map=<slug>`, and stop.
  Commit it on main only after his yes. The script, the skill and plumbing may be committed before.
- Never draw a landmark in code (stone strips, pill waterfalls). If it needs to stand up, it is a toy picture or it is left out.
- Who may play it: a player's own schools' grounds are free, every other school's come with Ink+, signed out every
  ground is open. That follows from `PLACES` (step 7); nothing else to gate.

## Steps

1. **Pick the ground** with the founder: which areas (two to six, each a few blocks) and which landmarks. Six to ten
   standing landmarks, two to four lawns or fields, at most one shuttle. Ask where the school's famous places are
   (a business school or medical campus may be off the main campus: Columbia's is at Manhattanville, a strip north
   along Broadway). → check: he named the areas.
2. **Outline the areas.** In `maps.js`, a `cut({...})` of lettered corners [longitude, latitude] shared by touching areas,
   then one `<town>('Area name', 'corner letters', [label lon, lat])` per area. Corners follow real streets.
   On a turned street grid give the ground its own named const for the angle (Columbia's is `AVENUES = 29`; `GRID = 38`
   is Roosevelt Island's, never reuse it) and give every turned lawn and field that turn. Halls with a toy are never turned.
   Keep every road, toy foot and lawn inside the areas: a road along an area's edge hangs half off the ground.
   Size the ground with `scale` (game units a metre, times ROOM) so its land area is near Ithaca's (about 11M units²;
   Morningside with Manhattanville is 16M, the most yet): Ithaca is 1.15, Roosevelt Island 2, Morningside 2.4.
   An outlying area joins as a narrow strip along the street that leads there, not a wide block of empty land.
   Working out corners: take two fixes on the main street from OSM (a station, a hall on it), step along it street by
   street, and step sideways in metres (one metre east is about 1.04e-5 of longitude and -4.4e-6 of latitude at
   Columbia's 29°; work it out for the grid you are on). A road's ends sit a few metres inside the edge, never on a corner.
3. **Look up the landmarks.** First list what OSM names in the box, biggest first, as ready rows:
   `node scripts/conga-osm.mjs <south,west,north,east> [--turn 29] --list > <scratchpad>/osm.txt`
   then keep the rows wanted, or ask for exact names: `... "Label=OSM name" ...` (exact OSM spelling; `--list` shows it).
   A name it cannot find is placed by hand and marked `// placed by hand` (OSM had no name on St. John the Divine).
   With `--turn` each row ends in that number of degrees: swap it for the ground's const.
   A point (a statue, a station) comes back 0 by 0 and its kind is only a guess (Alma Mater came back a `hall`): set both.
   A station's point is also a good fix on its street: the 125 St station placed Broadway at Manhattanville.
   The public servers are often busy; the script retries across mirrors and stops at once on a refused query.
   Kinds: `hall` (a toy building), `tower` (a tall toy on a small foot: a spire, a statue), `green` and `field`
   (painted, at least 260 each way), `water`, `road` / `bridge` ([kind, name, lat, lon, lat2, lon2, width]).
4. **Draw the toys.** For each landmark that should look like itself:
   - add one line to `PICKUPS` in `scripts/pickup-art.ts`: what it is, its two or three telling features, colours, and
     "seen from the front and a little above" (a car: "seen from the side and a little above"). Name the thing, not
     the place ("a bronze statue of a seated robed woman with her arms held open", not "Alma Mater").
   - list them with the cost and get the yes;
   - `node --env-file=.env.local --import tsx scripts/pickup-art.ts <names>` (output to a scratchpad file; PNGs land in
     `public/demo/pickup-art/`);
   - show them: copy `public/demo/mockups-conga-columbia-art.html` to `mockups-conga-<slug>-art.html`, change its list
     (file, label, the stock toy it replaces or null) and hand over that link. Mockup pages are gitignored: if it is not
     there, make one the same way (each PNG on the ground's felt, labelled, beside what it replaces). Redraw any he does not like (one name at a time);
   - pack them: add the names to `BIG` in `scripts/conga-scenery.mjs` (a small boat or car to `MIDDLE`; a train drawn as long as a building stays in `BIG`), bump
     `VERSION`, run `node scripts/conga-scenery.mjs`. The new `scenery.v<N>.webp` and the PNGs are new files: they go in
     the same commit as `scenery.js`, or every toy is missing;
   - writing on a toy (a sign, a number) reads backwards when it turns round: add its box, in the packed picture's own
     pixels, to `SIGN` in `index.html` (the taxi's roof sign, the 1 train's "1").
5. **Place the toys.** In `maps.js` `TOYS` map each standing landmark's label to its toy; the best-known ones also go in
   `LANDMARKS` (drawn 195 across, others 150), a statue in `STATUES` (drawn 100 across, a `tower` in front of its building).
6. **Bots.** In `maps.js` `GROUPS`, at least ten names of real-sounding groups on that campus (dorm floors, courses, clubs).
7. **The place picker.** In `maps.js` `PLACES`, the ground's school (`schoolOf` its slug, lib/campus/schools.ts) and one
   short line of what is on it ("College Walk, Barnard, Manhattanville"). A new school also needs:
   - its mascot's place on the animal sheet in `MASCOTS` (public/animals file number, e.g. NYU's bobcat is 40); it leads
     the start card's animals on that ground and is your animal there unless you picked your own seat;
   - its colours in `KITS` and `RINGS`, and its name in `SCHOOLS`, in `index.html` (NYU and CUNY are there already);
   - a school beyond those four has no mascot on the game's animal sheet (`FACES` is 42): its animal must be added to
     public/animals and the sheet rebuilt (`scripts/conga-atlas.mjs`), which is its own job; ask first;
   - a second campus of a school (as Cornell Tech is Cornell's) needs `PART_OF` in `lib/campus/schools.ts`.
   Who may play is then the same everywhere (the picker, and the board in `lib/campus/conga-board.ts` saveBest):
   your schools' grounds free, others Ink+, and with no school that has a ground yet, every ground.
8. **Shuttle** (optional): `more` returns `{ shuttles: [{ name, kind, road, stop, from, to, off, riders: 18, ride, stay: 5, away: 5 }] }`.
   `kind: 'bus'` hops along on wheels and `kind: 'train'` slides along a track (Columbia's 1 train); no kind is the
   floating tram. Every road gets a bus running up and down it unless a shuttle names it as its `road` (or a
   `kind: 'bus'` shuttle exists). `from` and `to` lie on that road and on the ground; `off` (the stop's badge, PLAZA + 20,
   about 150 units round) sits clear of the road's felt (half of max(130, width × scale) from its middle), of lawns and of
   toys. `ride` is seconds each way.
9. **The way in.** Add the slug to `MAPPED` in `lib/campus/doodles.ts`, so the campus's Doodles page plays this ground.
10. **Special lawns** (optional): `PAINT` in `index.html` draws a named green its own way (crossing paths, yard lines). Keep
    it to felt and stitch, as the others are.
11. **Check:** `node scripts/conga-check.mjs <slug>` prints every ground's size, then this ground's every thing; lines
    in capitals (START OFF, END OFF, CORNER OFF, TOY ON LAWN, NEAR ROAD, LAWNS OVERLAP?, STOP BADGE ON LAWN, and an area
    label marked OFF) are problems to fix.
    Then `npx vitest run app/conga/sim.test.ts --maxWorkers=3`, output to a file in the scratchpad. The tests run over
    every ground: names never under a toy, trees solid, bots, the way in and the picker's row present.
12. **Look:** open `/conga/play?map=<slug>&at=<landmark name>&dy=<units>` (the view holds on that landmark) for each area,
    at laptop and phone width, and open the start card's ticket to see the new school and place. The checks do not
    catch how it looks: toys crowding each other, a label under a toy, a stop's countdown pill under a tree.
    Hold the view on the stop's station (`at=`) and wait a ride: the shuttle comes round every ride × 2 + stay + away seconds.
    Then hand the founder the link and stop.

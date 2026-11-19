# School mascots: where this stands

Last worked on 2026-11-18. Stopped on purpose by the founder; do not draw or build more unless asked.

## Picked (the pictures in this folder)

| File | School | What it wears | Came from |
|---|---|---|---|
| `cornell-bear.png` | Cornell | red knitted scarf, white C | `cornell-bear/…round-4-all-brown-4.png` |
| `columbia-lion.png` | Columbia | light blue knitted sweater, small white crown | `columbia-lion/…sweater-crown-4.png` |
| `nyu-bobcat.png` | NYU | violet varsity jacket, white torch | `nyu-bobcat/…jacket-torch-2.png` |
| `baruch-bearcat.png` | CUNY Baruch | royal blue knitted sweater, white B | `baruch-bearcat/…sweater-b-3.png` |
| `brooklyn-bulldog.png` | CUNY Brooklyn | maroon cap, gold BC, maroon collar | `brooklyn-bulldog/…cap-bc-3.png` |

Every try, picked or not, is in the sibling folders and shows on `/demo/mockups-animals.html`.

## In the app

Cornell, Columbia and NYU only, as `public/animals/38.png`, `39.png`, `40.png` (faces 37, 38, 39).
They are the "School" category: free to people of that school, hidden from everyone else, shown first in the
picker with a ring and a graduation cap in the action colour. The admin can move them under `/c/admin` → Animals.

- Which face is which school: `MASCOT` in `lib/campus/animals.ts`
- The rule: `picks`, `schoolOfPerson`, `setBuiltTier` in `lib/campus/animal-tiers.ts`; `pickFace` in `lib/campus/people.ts`
- The look: `SchoolMark` in `components/campus/ink-mark.tsx`, `.cs-pet.school` in `app/c/campus.css`
- Tests: "offers a school's own animal to people of that school alone" in `app/c/campus-screen.test.tsx`
- No migration. As of 2026-11-18 this was uncommitted and not deployed; check `git log` and `git status`.

Baruch and Brooklyn are NOT in the app.

## Not done

- CUNY colleges not drawn: City College beavers, Staten Island dolphins, Hunter hawks, John Jay bloodhounds,
  Lehman Lightning, Medgar Evers cougars, City Tech yellow jackets, Queens Knights, York cardinals.
- Two are not animals. Ideas only, not agreed: Queens = a horse in a knight's helmet, Lehman = a lightning bug.
- Open question: the app has CUNY as one campus. Offer every CUNY mascot to all of CUNY, or each only to its
  college's email (such as `baruch.cuny.edu`)?
- Not checked: the School ring and cap have not been looked at in a browser.

## How to draw the next one

Model: `openai/gpt-image-2.6-flare` through the Vercel AI Gateway, four pictures a go, a few cents each.
Send ONE picture alone (the Cornell bear) with one short line. Sending one of the set's originals alongside
leaks its markings (the panda's eye patches came through).

PowerShell, from the repo root:

```powershell
$env:ANIMAL_REFS=','; $env:ANIMAL_MODELS='openai/gpt-image-2.6-flare'; $env:ANIMAL_N='4'; $env:ANIMAL_LABEL='scarf'
$env:ANIMAL_PROMPT='Make a beaver as a toy figure in exactly the style of this bear: the same body shape, proportions, face, small dot eyes, blush, standing pose, finish and lighting. <what the animal looks like>. Instead of the scarf it wears <garment in school colours with one plain letter or simple shape>. No other text. Plain white background.'
node --import tsx scripts/animal-test.ts ccny-beaver none 'public/demo/animal-tests/0-picked/cornell-bear.png'
```

- The second argument must be a word such as `none`: PowerShell drops an empty `''`, and the picture is then not sent.
- To change one detail, send the chosen picture instead of the bear, with "Redraw this exact figure with one change: …".
- Copy the picked one into this folder.
- To put it in the app: `node --import tsx scripts/animal-keep.ts public/demo/animal-tests/0-picked/<name>.png <next number>`
  (redraws it on a transparent ground at 192px), then add its name to `PREMIUM` and its school to `MASCOT`
  in `lib/campus/animals.ts`, and update the counts in the tests.

## What the founder asked for

- Each mascot carries something that says the school ("otherwise you can't tell"): a letter, or the school's
  symbol as a plain shape. Never the school's official logo or its official mascot character.
- Give each school a different garment so they do not look alike (Baruch and Brooklyn are both B).
- A block N on purple reads as Northwestern, not NYU.
- The founder picks by file name from the page; offer two clothing rows when unsure.

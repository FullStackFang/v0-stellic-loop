# School mascots: where this stands

Last worked on 2026-11-19: the founder had Baruch and Brooklyn added to the app and expects to make a few more.

## Picked (the pictures in this folder)

| File | School | What it wears | Came from |
|---|---|---|---|
| `cornell-bear.png` | Cornell | red knitted scarf, white C | `cornell-bear/…round-4-all-brown-4.png` |
| `columbia-lion.png` | Columbia | light blue knitted sweater, small white crown | `columbia-lion/…sweater-crown-4.png` |
| `nyu-bobcat.png` | NYU | closed violet varsity jacket, white torch | `nyu-bobcat/…jacket-n1-torch-4.png` (redrawn from `…jacket-n-1.png`; before that `…jacket-torch-2.png`) |
| `baruch-bearcat.png` | CUNY Baruch | royal blue knitted sweater, white B | `baruch-bearcat/…sweater-b-3.png` |
| `brooklyn-bulldog.png` | CUNY Brooklyn | maroon cap, gold BC, maroon collar | `brooklyn-bulldog/…cap-bc-3.png` |
| `oakland-grizzly.png` | Oakland University | a girl: black knitted sweater, gold O, gold ear bow | `oakland-grizzly/…sweater-o-4.png` |
| `maryland-terrapin.png` | Maryland | a girl: red knitted scarf, white M, gold bow | `maryland-terrapin/…scarf-m-2.png` |

Every try, picked or not, is in the sibling folders and shows on `/demo/mockups-animals.html` (up to Maryland); from now on each new animal gets its own page, `/demo/mockups-animals-<name>.html`.

## In the app

Cornell, Columbia, NYU, Baruch, Brooklyn, Oakland and Maryland, as `public/animals/38.png` to `44.png` (faces 37 to 43).
Oakland's grizzly (slug `oakland`) and Maryland's terrapin (slug `maryland`) belong to schools that are not campuses yet:
until the admin adds each with that slug (`oakland.edu`, `umd.edu`), only the admin sees them.
Baruch and Brooklyn both belong to `cuny`: the app has CUNY as one campus, so all of CUNY may pick either.
They are the "School" category: free to people of that school, hidden from everyone else, shown first in the
picker with a ring and a graduation cap in the action colour. The admin can move them under `/c/admin` → Animals.

- Which face is which school: `MASCOT` in `lib/campus/animals.ts`
- The rule: `picks`, `schoolOfPerson`, `setBuiltTier` in `lib/campus/animal-tiers.ts`; `pickFace` in `lib/campus/people.ts`
- The look: `SchoolMark` in `components/campus/ink-mark.tsx`, `.cs-pet.school` in `app/c/campus.css`
- Tests: "offers a school's own animal to people of that school alone" in `app/c/campus-screen.test.tsx`
- No migration.

## Not done

- CUNY colleges not drawn: City College beavers, Staten Island dolphins, Hunter hawks, John Jay bloodhounds,
  Lehman Lightning, Medgar Evers cougars, City Tech yellow jackets, Queens Knights, York cardinals.
- Two are not animals. Ideas only, not agreed: Queens = a horse in a knight's helmet, Lehman = a lightning bug.
- Open question: every CUNY mascot is offered to all of CUNY for now. Should each go only to its
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
  in `lib/campus/animals.ts` (the next number is 45, face 44), and update the counts in
  `app/c/campus-screen.test.tsx` (search for "Animals ?44", "toHaveLength(44)", "School 7", "face: 44" in lib/__tests__/campus-animal-names.test.ts and the offered lists).

## What the founder asked for

- Each mascot carries something that says the school ("otherwise you can't tell"): a letter, or the school's
  symbol as a plain shape. Never the school's official logo or its official mascot character.
- Give each school a different garment so they do not look alike (Baruch and Brooklyn are both B).
- A block N on purple reads as Northwestern, not NYU.
- The founder picks by file name from the page; offer two clothing rows when unsure.

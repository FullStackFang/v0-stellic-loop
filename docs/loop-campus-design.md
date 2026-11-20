# Loopd Campus · the design

*Named and picked by the founder on 2026-11-17. Status: **mockup only, not yet in the app.***

"Loopd Campus" is the name of this look, so it can be told apart from the earlier ones
(Stellic demo, Sun, Night, Quorum, HAI). To pick it up in a new session, say
"continue Loopd Campus" and point at this file.

It is not the same thing as the OpenSpec change `loop-campus-rewards`, which is a product
feature (a campus page and group rewards). This file is only about how the app looks.

## Where things are

| What | Where |
| --- | --- |
| The picked design, clickable | `public/demo/mockups-campus.html` (opens on it; served at `/demo/mockups-campus.html`, address `#c/team4/coral`) |
| The first round, in lemon and lime | `public/demo/mockups-citrus.html` |
| What the app looks like today (HAI: navy, teal, lime) | `DESIGN.md`, `app/loop.css` |
| This look in the app | not started |

The mockup also holds the layouts and colour sets that were not picked (layouts A and B;
Cream, Vermilion, Gold, Blush, Big Red, Citrus). They are for comparison only.

## How we got here

1. The founder asked for something closer to Luma or Partiful, with a twist of our own.
2. Round 1 (`mockups-citrus.html`): three layouts in lemon and lime. Founder: "I love this".
3. The founder asked for school pride instead of citrus, thinking of Cornell.
4. A home set (carnelian with white type) and an away set (white with carnelian type) were
   tried and rejected: first too bright, then too flat.
5. The founder said citrus "looks amazing", so the reds were rebuilt the way citrus is built:
   one light, bright colour for the big areas with dark type on it, and a second colour for actions.
6. Picked: **layout C in the Coral set.**

## The idea

- **It looks like it belongs to the school.** The colours come from the school. Cornell is the first.
- **Two colours, two jobs.** Coral holds the big areas and carries dark type. Carnelian is for
  actions and carries white type. Carnelian never covers a large area: that was the "too bright" problem.
- **The shell stays.** Left rail, row lists and the one tight corner are the same as today, so moving
  to this look is mostly a recolour.
- **Flat and solid.** Hard offset shadows, no blur, no glass. The only gradient is the light on the cover tile.

## Colour (Cornell Coral)

All OKLCH. Names are the roles; the mockup's token names are in brackets.

| Role | Value | Used for |
| --- | --- | --- |
| Coral (`--F`) | `oklch(82% 0.12 38)` | The band on top, the current item in the rail, date tiles |
| Carnelian (`--A`) | `oklch(48.5% 0.185 27)` (Cornell's `#B31B1B`, not yet checked against their brand guide) | Buttons, the cover tile, a date tile once its event is on |
| Carnelian, lighter (`--A2`) | `oklch(57% 0.2 30)` | Button hover, light in the cover |
| Carnelian, deep (`--A4`) | `oklch(34% 0.13 24)` | Shade in the cover |
| Coral on dark (`--P`) | `oklch(84% 0.115 38)` | Headline on the dark announcement card, the selected tab's text, small notes in the rail |
| Hard shadow (`--H`) | `oklch(68% 0.14 33)` | The offset shadow under cards |
| Ink (`--ink`) | `oklch(21% 0.016 30)` | Text, the rail, the announcement card, the selected tab |
| Page (`--bg-c`) | `oklch(96.8% 0.01 70)` | Page background |
| Paper (`--paper`) | `oklch(99.2% 0.004 60)` | Cards, type on carnelian |
| Muted (`--mute`) | `oklch(45% 0.016 40)` | Secondary text |
| Line (`--line-c`) | `oklch(88% 0.012 50)` | Row dividers |
| On dark / muted on dark | `oklch(96.5% 0.008 70)` / `oklch(75% 0.016 40)` | Text in the rail and on ink |

Rules:
- Dark type on coral, white type on carnelian. Never the other way round.
- One carnelian action per row or area.
- Neutrals lean slightly warm so the reds sit in them. No pure black or white.
- Another school is another set of these values; nothing else changes.

## Type

Archivo, as today. Page title weight 720 at 112% width, 62px, tight tracking. Section titles 20px, weight 660.
Body 15px. Numbers are tabular. No all-caps labels.

## Shape

- Cards and lists: `22px 22px 22px 6px` (one tight corner, as today).
- **Nothing clickable is bare text.** Every link, tab, filter and action sits in a pill: filled ink when it is the current one, outlined on paper otherwise. This holds most of all in headers and bars, where bare text on the coral field is hard to see and does not read as something to press. (Founder rule, 2026-11-18.)
- Buttons and tabs are pills. Date tiles: `12px 12px 12px 3px`.
- Cards: no border, a hard shadow `5px 5px 0` in the shadow colour. The cover tile and the
  carnelian buttons: hard shadow in ink (`6px 6px 0` and `3px 3px 0`).

## Parts (layout C)

- **Rail** (240px, ink): wordmark, "Your groups" with a letter tile per group, "This group"
  (Record, Resources, Members, Assistants; the current one is a coral pill with dark type), account at the foot.
  Under 860px it becomes a top bar.
- **Band** (coral, full width): handle, group name, one line of purpose, the deadline in an ink date tile,
  faces with a count, then "Tell the group" (carnelian) and "Share link" (paper, outlined).
- **Cover tile** (208px, right side of the band): carnelian with slow-moving light and the woven-rings mark in white,
  top ring ink. The mark itself is unchanged.
- **Coming up**: one card of rows. Each row has a date tile, title, time and place, faces of who is interested,
  a ring with one wedge per person needed, and an "Interested" button. When enough people are in, the row says
  "It's on" and its tile turns carnelian.
- **The record**: tabs (Decisions, Claims, Outputs; the selected one is an ink pill) over one card of rows:
  number, topic, statement, who and through which assistant, date.
- **Side column**: the announcement on an ink card with a carnelian hard shadow, then People.

## Motion

Group and tab changes morph the cover and title (View Transitions, where the browser has them).
The cover's light drifts slowly and follows the pointer. A new face pops in when you press Interested.
Everything stops under `prefers-reduced-motion`.

## Waiting

Anything that loads, or takes time, shows one of two loaders (`components/loading`, openspec `loop-loading-seats`). Nothing else waits in a way of its own; `lib/__tests__/loading-words.test.ts` keeps it so.

- **The ticket** ("Saving seats") for a whole page: four seats fill with faces, the last one yours, and one line, "Looping you in…". After a page that had the top bar, the bar stays and the pressed link is marked. Mockup: `/demo/mockups-loading-places.html`.
- **The small one** ("Your blot") for a button, a row, or a late part of a page: your face with your ink welling up under it. In a button it sits before one short word with no ellipsis ("Saving", "Posting"). For a part of a page it carries the line in a pill. Mockup: `/demo/mockups-loading-small.html`, row C.
- **A long, known wait** (drawing a pet): the ticket fills once, slowly, and its last seat stays ringed and empty until the picture comes.
- **150 ms rule**: a loader fades in after 150 ms, so a fast answer never flashes one.
- **The ending**: a page-sized ticket seen for 400 ms or more ends with a small ink splat on its stub, then drops away over the page that has arrived. Free is one plain dark shape; Ink is your own blot in the school's two inks; Ink+ adds a spark and thrown sparks in a third ink (`--cs-third`). Mockup: `/demo/mockups-loading-splat-2.html`, row A.
- Under `prefers-reduced-motion` every loader stands still in its finished pose, still says its line, and there is no ending.

## Not decided yet

- Whether "N more and it's on" matches how ideas become plans in the product. If not, the ring is a plain count.
- Whether the local Archivo font file includes the width axis the page title uses.
- Dark mode.
- Which older pages get redrawn and which are cut (same open list as in `DESIGN.md`).

## Moving it into the app (proposed, not started)

1. **Recolour**: rail, buttons, tabs, cards, shadows and the plate across every page already on the
   system, in `app/loop.css`. No behaviour changes. Rewrite `DESIGN.md` to this look in the same step.
2. **New pieces**: the cover tile and the "Coming up" rows with the ring on the team page.

The founder has not yet said when to start. The branch had a lot of uncommitted work in
`app/loop.css` and the team pages on 2026-11-17.

# Loop · Design system

*Settled 2026-11-12. This is the look for the whole app. Every new page and every
redraw uses it. The product reasoning that used to live in this file is now
`docs/proposal-board-design.md`.*

Lineage: Stanford HAI's system (navy, teal, aqua, a little lime; panels with one
tight corner; pill buttons) on an app shell. Earlier looks (Sun, Night, Quorum
`quorum.html` v5, the trip look in `TripView.css`) are retired. Don't bring them back.

**Where it lives**

| What | File |
| --- | --- |
| Tokens, shell, every component class | `app/loop.css` (imported once in `app/layout.tsx`) |
| The mark and the arrow | `components/LoopGlyphs.tsx` (`Rings`, `Arrow`) |
| /groups-only marks (assistant shapes, alert) | `app/groups/glyphs.tsx` |
| Landing-page layout | `app/home.css` |
| Claude Design System (private, mirrors this file) | https://claude.ai/artifact/9Y1uJQY3wddzmv2sZUMDW8 |
| Approved mockups | `public/demo/mockups-layer-a3.html` (app), `public/demo/mockups-loop-mark-polish.html` (mark, option 3) |

A page opts in by wrapping itself in `.lp`. Everything in `loop.css` is scoped under
`.lp`, and class names carry the `lp-` prefix, because `globals.css` still owns short
names (`.row`, `.num`) for pages not yet redrawn.

## Scene

A member checks what their team decided, between classes or at a desk, on a laptop
or a phone in daylight. Light canvas, dark rail, one coloured plate per page.
Calm and institutional, with one bright thing: the action you're meant to take.

## Colour

All colours are OKLCH tokens on `.lp`. Never use `#000` or `#fff`.

| Token | Value | Role |
| --- | --- | --- |
| `--canvas` | `oklch(96.2% 0.004 230)` | Page background |
| `--surface` | `oklch(99.3% 0.003 230)` | Panels, lists, inputs |
| `--sunk` | `oklch(97.7% 0.006 240)` | Row hover |
| `--line` / `--line-2` | `oklch(90.6% 0.008 240)` / `oklch(85.5% 0.011 240)` | Hairlines, input borders |
| `--navy` | `oklch(35.4% 0.095 252)` | Text, the rail |
| `--ink-2` | navy at 85% | Secondary text on light |
| `--muted` | `oklch(46.5% 0.012 245)` | Meta text, dates |
| `--blue` | `oklch(47.6% 0.13 250)` | Links, filled buttons, the current tab, focus ring |
| `--teal` | `oklch(37.3% 0.052 206)` | The plate |
| `--aqua` | `oklch(90.4% 0.1 194)` | Type and the mark on teal or navy |
| `--lime` | `oklch(96.4% 0.19 117)` | The one action, and "you" |
| `--plum` | `oklch(42.6% 0.13 322)` | Conflicts, past due, errors |
| `--pale-blue` / `--pale-plum` | | Chip and flag backgrounds |
| `--on-dark`, `-78`, `-66` | | Text on navy or teal, three strengths |

Rules:
- **Lime is rare.** It marks the one action on a screen (Sign in, an open chip) and
  "you" (the top ring of the mark, step 1, your own lit row). Never body text, never
  on white at small sizes (it disappears), never two lime actions on one screen.
- **Plum means something is wrong.** Conflicts, past due, errors. Never decoration.
- Teal is for the plate only: one per page, at the top.
- Who saved a record never rests on colour alone: each assistant has a shape and a name (`Via`).

## Type

One family: **Archivo** (`--font-archivo`, local variable font), weights 400 to 600.
- Body 14 to 15px, line-height 1.45, tracking −0.02em, `tabular-nums` everywhere.
- Headings weight 480 to 520, tracking −0.035em; display (plate headlines) −0.055em,
  line-height 0.95, max-width about 10ch.
- Two-tone headline: aqua, with the last phrase in lime (`<em>`), on teal only.
- Meta 12.5 to 13.5px in `--muted`. Mono (`--mono`) only for record numbers and handles.
- No all-caps labels, no tracked-out eyebrows. A kicker is sentence case in aqua with a lime dot.

## Shape and space

- Radius has **one tight corner**: `--r-lg: 24px 24px 24px 6px` (plates, lists),
  `--r-md: 16px 16px 16px 4px` (panels, facts strip). The signed-out plate uses 32/8.
- Buttons are pills (`--pill: 56px`). Chips are pills.
- Elevation is flat: hairline borders (`--line`). Only floating menus get `--float`.
- Spacing steps: 4, 6, 8, 12, 14, 16, 20, 24, 32. Page gutter 32px desktop, 16px phone.

## The mark

Three rings, woven: each passes over one neighbour and under the other (top over
left, left over right, right over top). The **top ring is lime**: you, linked to the
other two. `Rings` in `components/LoopGlyphs.tsx`.

- `<Rings />` solid, for 16 to 28px (rail, switcher, favicon, top bars).
- `<Rings inline />` uses HAI's inline stroke (three parallel lines) for 48px and up
  (team plate, home plate, signed-out page).
- The gaps where a ring passes under are painted with `--lp-ring-bg`. Whatever the mark
  sits on must set it: `.lp` sets canvas, `.lp-rail` navy, `.lp-plate`, `.lp-signin`
  and `.lp-switch-mark` teal. A new surface sets its own.
- Ring colour comes from `currentColor`: aqua on navy and teal, navy on light.
- On light backgrounds at small sizes the lime ring is faint. Prefer putting the mark
  on a navy or teal tile there.
- Don't redraw it: no gradients, no 3D, no glow, no animated writing, no gaps or
  dots added. (Rejected 2026-11-12, see `public/demo/mockups-loop-mark-2.html` and `-3.html`.)

## Components (classes in `loop.css`)

- **Shell** `.lp > .lp-rail + .lp-main > .lp-wrap`: navy rail at 248px with wordmark,
  team switcher (`.lp-switch`), nav groups (`.lp-nav-label`), account at the foot.
  Under 820px the rail becomes a top bar.
- **Crumbs** `.lp-crumbs`: where you are, today's date on the right.
- **Plate** `.lp-plate`: teal, the mark at 88px, handle, aqua title, one line of
  purpose, and a date block (`.lp-dateblock`) for the deadline.
- **Facts strip** `.lp-facts`: four facts, each a link to its section. Facts, not scores.
- **Tabs** `.lp-tabs`: pill links driven by `?tab=`; the current one is filled blue.
- **Record list** `.lp-list > .lp-row`: number, statement, person and assistant, date.
  `.lp-row-flagged` tints plum; `:target` outlines blue.
- **Buttons**: `.lp-btn` (outlined pill with arrow); `.lp-btn-primary` (filled blue);
  the lime action (`.lp-signin-go`) only where it is the screen's one thing to do.
- **Chips** `.lp-chip`, `.lp-chip-open` (lime). **Conflict link** `.lp-ref` (pale plum).
- **Panels** `.lt-editor` inside `.lp`: surface, hairline, one tight corner.
- **Forms** `.emba-form` inside `.lp`: 10px-radius inputs, the filled button last.
- **Empty state** `.lp-empty`: one sentence of what will appear and how it gets there.
- **Signed-out page** `.lp-signin`: the teal plate fills the page; three numbered steps
  (step 1 lime), the lime Sign in pill, the large inline mark.

## Motion

- Ease `--ease: cubic-bezier(.22,1,.36,1)`; hovers and presses 0.1 to 0.2s, colour only.
- One large moment at most per page: the mark opens once (clip reveal, 1.6s), then
  turns very slowly (90s a turn). Nothing else moves on its own.
- No bounce, no writing animations, no pulsing. `prefers-reduced-motion` stops everything.

## Copy

- Plain words a member would use: "Sign in", "Accept your invitation", "Mark done".
- Say what happened and what to do next. No em dashes.
- Never mention advising, counsellors or staff signals in member copy.

## Don't

- Gradients, glass, glow, 3D or lit renderings, emoji.
- Cards inside cards, identical card grids, big-number hero metrics.
- A second accent colour, or lime used as decoration.
- Coloured side stripes on cards or rows.
- Restyling a flow while changing the look: a look pass touches CSS and markup, not behaviour.

## Pages on the system

Done: `/` (landing), `/privacy` and `/terms` (`components/Legal.tsx`: top bar `.lp-top`,
one panel `.lp-legal`), `/groups` and everything under it (team page fully redrawn;
members, resources, assistants on the shell and form styles).

Still on retired looks, and may be cut depending on the app's design (decide before
redrawing): `/emba` and `/emba/sign-in`, `/b/[slug]` (+ `/new`, `/you`), `/p/[id]`,
`/trips/new`, `/trips/[id]/edit`, `/trip/[slug]`.

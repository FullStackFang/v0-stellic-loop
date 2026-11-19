## Why

The app says almost nothing while it works. Opening a campus page shows a blank page, moving between campus pages leaves the old page still, and most buttons only grey out. Where it does say something, it says it six different ways ("Opening…", "One moment…", "Reading…", "Saving…", "Finding you", "Loading sign-in…").

On 2026-11-19 the founder picked one loader for the whole app, "Saving seats" (direction B of `public/demo/mockups-loading.html`), and approved where it goes (`public/demo/mockups-loading-places.html`: "this is all beautiful"). This change puts it there.

## What Changes

- One loader, **Saving seats**, in two sizes:
  - **The ticket**: a small ticket whose seats fill one by one with animal faces, while its stub stays blank. It always carries the same line, "Looping you in…" (founder, 2026-11-19: one standard wording). The last seat is the viewer's own face.
  - **The small one**: three small faces that fill in, for inside whatever was pressed.
- **The whole screen** (opening the app cold): the ticket alone on the school's colour. Today: a blank page.
- **Changing page** on the campus pages: the bar stays, the pressed link holds the small one, and the ticket takes the page under the bar. Today: the old page stays and nothing moves.
- **Groups pages**: the ticket replaces "Opening…" over grey bars. The bar stays, as it does today.
- **Shared links** (`/e`, `/a`, `/o`): the ticket while the page is read. Today: nothing.
- **The sign-in card**: the ticket replaces "Loading sign-in…".
- **One part of a page**: the ticket sits in the part that is late, and the rest of the page stays usable. Near you while it finds you (today: "Finding you" as text), a ticket's map (today: an empty box), and Ink drawing your pet (today: your photo and one line).
  - Drawing your pet takes about half a minute, so it uses a slow ticket: one seat at a time, and the last, ringed seat is the pet being made.
- **After a press**: the pressed button holds the small one until the answer is back. I'm in, Join, Check in, Register me, Leave, Mark as used, inviting a person, Post it, Fill in, Save, picking a face, changing campus, Subscribe, Keep this one. Today: the button greys out, or its words change.
- The words "One moment…", "Reading…", "Saving…", "Opening…", "Finding you" and "Loading sign-in…" go, replaced by the loader and its one line. A button that had a word keeps a short one beside the small faces ("Posting", "Reading").
- **The ending**: when a page-sized wait is over, a small ink splat stamps the blank stub, the ticket takes the knock and drops away, and the page is there. Founder, 2026-11-19: "Stamped is good", then "A is good" (`public/demo/mockups-loading-splat-2.html`, row A). The splat differs by plan:
  - **Free**: a small splat of plain dark ink, no colour.
  - **Ink**: the member's own blot, in the school's two inks (the blot already under their face).
  - **Ink+**: the same blot with a bright third ink: a spark in its middle and sparks thrown around it. Ink+ is not in the app yet, so this is drawn and tested but nobody sees it until Ink+ exists.
- Reduced motion: the loader stands still (seats full, stub blank) and still shows its line, and there is no ending.

Not in this change: selling or granting Ink+, and the older pages on retired looks (`/emba`, `/b`, `/p`, `/trip`, `/trips`).

## Capabilities

### New Capabilities
- `loading-states`: what the app shows while it waits, at each size (whole screen, changing page, one part of a page, after a press), what the loader says, whose faces are on it, and how it behaves with reduced motion and for screen readers.

### Modified Capabilities

None. `page-speed` already requires a loading state on group pages with the menu kept; this change draws that state differently and does not change the requirement.

## Impact

- New: `components/loading/` (the ticket, the small one, the ending, their stylesheet, and the piece that remembers the bar), `app/c/loading.tsx`, `app/e/[token]/loading.tsx`, `app/a/[token]/loading.tsx`, `app/o/[token]/loading.tsx`.
- Changed: `app/groups/loading.tsx`, `components/campus/screen.tsx` (the bar's links, the ticket buttons, the face picker, the campus change), `components/campus/composer.tsx`, `components/campus/plan-form.tsx`, `components/campus/near.tsx`, `components/campus/own-face.tsx`, `components/campus/door-sign-in.tsx`, `app/groups/sign-in`, `app/loop.css` (the old `.lp-loading` rules go once nothing uses them).
- Changed for the ending: `lib/campus/ink-blot.ts` (the drops a splat throws), `app/c/campus.css` (one new colour per school, the third ink), `app/c/layout.tsx` and `app/groups/layout.tsx` (where the ending is drawn).
- No database change, no new dependency, no change to any action or read.
- Tests that look for today's waiting words need the new ones.
- `DESIGN.md` says "no pulsing" and "nothing else moves on its own" for the older look; `docs/loop-campus-design.md` gets a short "Waiting" section.

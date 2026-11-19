## Why

The app says almost nothing while it works. Opening a campus page shows a blank page, moving between campus pages leaves the old page still, and most buttons only grey out. Where it does say something, it says it six different ways ("Opening…", "One moment…", "Reading…", "Saving…", "Finding you", "Loading sign-in…").

On 2026-11-19 the founder picked one loader for the whole app, "Saving seats" (direction B of `public/demo/mockups-loading.html`), and approved where it goes (`public/demo/mockups-loading-places.html`: "this is all beautiful"). This change puts it there.

## What Changes

- One loader, **Saving seats**, in two sizes:
  - **The ticket**: a small ticket whose seats fill one by one with animal faces, then its stub is stamped "It's on". It always carries the same line, "Looping you in…" (founder, 2026-11-19: one standard wording). The last seat is the viewer's own face.
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
- Reduced motion: the loader stands still (seats full, stub stamped) and still shows its line.

Not in this change: the ending shown in the first mockup (the school colour flooding in as the page arrives), and the older pages on retired looks (`/emba`, `/b`, `/p`, `/trip`, `/trips`).

## Capabilities

### New Capabilities
- `loading-states`: what the app shows while it waits, at each size (whole screen, changing page, one part of a page, after a press), what the loader says, whose faces are on it, and how it behaves with reduced motion and for screen readers.

### Modified Capabilities

None. `page-speed` already requires a loading state on group pages with the menu kept; this change draws that state differently and does not change the requirement.

## Impact

- New: `components/loading/` (the ticket, the small one, their stylesheet, and the piece that remembers the bar), `app/c/loading.tsx`, `app/e/[token]/loading.tsx`, `app/a/[token]/loading.tsx`, `app/o/[token]/loading.tsx`.
- Changed: `app/groups/loading.tsx`, `components/campus/screen.tsx` (the bar's links, the ticket buttons, the face picker, the campus change), `components/campus/composer.tsx`, `components/campus/plan-form.tsx`, `components/campus/near.tsx`, `components/campus/own-face.tsx`, `components/campus/door-sign-in.tsx`, `app/groups/sign-in`, `app/loop.css` (the old `.lp-loading` rules go once nothing uses them).
- No database change, no new dependency, no change to any action or read.
- Tests that look for today's waiting words need the new ones.
- `DESIGN.md` says "no pulsing" and "nothing else moves on its own" for the older look; `docs/loop-campus-design.md` gets a short "Waiting" section.

## Context

The founder picked the loader and approved its placements from two mockups on 2026-11-19:

- `public/demo/mockups-loading.html`: three loaders; **B, "Saving seats"** was picked ("i like B and it gets to reuse the cute ass avatars").
- `public/demo/mockups-loading-places.html`: every wait in the app drawn with B ("this is all beautiful"). This page is the visual reference. Its CSS for `.st` (the ticket), `.st.slow` and `.sf` (the small one) is what gets ported.

What the code does today, read on 2026-11-19 on `feat/campus-one-line`:

- **Campus pages** (`app/c/**`): no `loading.tsx`. The bar (`CampusBar` in `components/campus/screen.tsx`) is drawn by each page from the page's own data, not by a layout. `app/c/layout.tsx` only wraps `CampusShell` (stylesheet, kit script, Clerk).
- **Groups pages**: `app/groups/loading.tsx` shows "Opening…" and four grey bars (`.lp-loading` in `app/loop.css`); `app/groups/[namespace]/loading.tsx` re-exports it. The bar is in `app/groups/layout.tsx`, so it already stays. That layout already imports `app/c/campus.css` and knows the person's face.
- **Buttons**: `CampusScreen` has one `useTransition` (`busy`) shared by every ticket button; all of them disable together and none says which was pressed. The composer, the plan form and the older forms change their words.
- **Parts**: Near you tracks `where: 'wait' | 'here' | 'away' | 'off'` and prints "Finding you"; a ticket's map is a lazy `<iframe>`; Ink's `own-face.tsx` has a `busy` state that shows the photo and "This takes about half a minute".
- **Sign-in**: Clerk's `fallback` prop is a line of grey text in two places.
- Next is 16.4.6. `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` and `.../04-functions/use-link-status.md` were read: a `loading.js` fallback is shown at once on a client navigation and wraps the page but not the layout; `useLinkStatus` gives the pending state of the `<Link>` it sits inside, and is skipped when the route was prefetched.

## Goals / Non-Goals

**Goals:**
- One loader component used by every wait on the campus pages, the groups pages, the shared links and the sign-in cards.
- What the founder saw in the placements mockup, with the differences listed under Risks.
- No change to any action, read, or permission. No new dependency.

**Non-Goals:**
- The ending from the first mockup (the stub stamps and the school colour floods in as the page arrives). A Suspense fallback is removed the moment the page is ready, so an ending needs its own mechanism. See Open Questions.
- The older pages on retired looks (`/emba`, `/b`, `/p`, `/trip`, `/trips`), which may be cut.
- Making any wait shorter. This change is about what a wait looks like.
- Moving `CampusBar` into a layout.

## Decisions

### D1. The loader is two small components with their own stylesheet
`components/loading/seats.tsx` exports `SeatsTicket({ face?, slow?, filled? })` and `SeatsSmall({ face? })`, with `components/loading/seats.css`. Neither holds state; both work as server or client components.

The stylesheet is its own file, not more rules in `app/c/campus.css`, because the loader is also used where `.cs` may not be an ancestor (the sign-in fallback, shared links). Its classes are prefixed `seats-`, it reads the `--cs-*` colour tokens, and each read has the Loop kit's value as a fallback so it never renders colourless.

Alternative: put it in `campus.css` under `.cs`. Rejected: two of the places are not sure to be inside `.cs`, and that file is being edited by other sessions.

### D2. The faces are fixed, and the last one is the viewer's
The first seats are a fixed list of free animals (`animal(n)` from `lib/campus/animals.ts`), so the server and the browser draw the same thing and nothing shifts on hydration. The last seat takes `face`, a picture address. Where the caller does not know it, the last seat is one more free animal.

Who knows the face:
- Groups: `app/groups/layout.tsx` already works it out; it is passed down through the piece in D3.
- Campus: `CampusBar` has `viewer.face`; it is remembered by the piece in D3.
- Cold open, shared links, sign-in: not known, so a free animal.

Alternative: random animals each time. Rejected: hydration mismatch, and a loader that looks different on every blink reads as noise.

### D3. Page changes use `loading.tsx`, and the fallback redraws the bar from what the last page showed
`app/c/loading.tsx` renders a client component, `components/loading/page-wait.tsx`.

Because `CampusBar` lives in the page, a plain fallback would remove the bar on every page change. Instead a small client module, `components/loading/last-bar.ts`, keeps in memory what the last campus page's bar showed: its links (label, address, which is current), the viewer's face, and the label of the link that was just pressed. `CampusBar` writes to it when it draws; a click on a bar link writes the pressed label.

`PageWait` reads it:
- **Something remembered** (a client navigation): it draws the bar's band with the same links, not pressable, the pressed one marked and holding the small one, and under it the ticket.
- **Nothing remembered** (a cold open, which is server-rendered): it draws the whole screen in the field colour with the ticket.

The ticket's line is the same in both, and everywhere else: "Looping you in…" (D12). The pressed label is remembered only to mark which link holds the small one.

The memory is a module variable, not `sessionStorage`: it must be empty on a fresh page load so the cold open and the server's HTML agree, and a module variable is.

Alternatives considered:
- Move `CampusBar` into `app/c/layout.tsx` so it truly stays. This is the cleaner structure, but the bar takes page-specific props (`on`, `children`, `swap`, `signOut`) and reads the page's `screen`; the docs also warn that a layout reading cookies blocks the fallback unless wrapped in its own Suspense. It is a larger change than this one. Left as a follow-up.
- No `loading.tsx`; keep the old page and lay the ticket over it from a client "navigating" state. Rejected: a cold open would still be blank, and it fights the framework's own pending handling.

Groups need none of this: their bar is in the layout. `app/groups/loading.tsx` renders the ticket in the page's place.

### D4. The pressed link shows the small one with `useLinkStatus`
A tiny client component, `LinkWait`, placed inside each bar `<Link>` (campus and groups) and inside the campus-swap tickets, shows `SeatsSmall` while `useLinkStatus().pending` is true. Following the docs' note on layout shift, its box is always there at a fixed size and only its visibility changes.

It covers the gap before the fallback paints, and the case where there is no fallback. It replaces the lime dot (`.lp-wait`) on the groups menu where that still exists.

### D5. Which button was pressed
`CampusScreen` keeps one more piece of state beside `busy`: the key of the control that started the transition (for example `in:<ticket id>`, `invite:<ticket id>:<person id>`). `run` takes the key. A button shows the small one when `busy` and the key is its own; every other button stays disabled without it, as today.

The composer, the plan form (`reading` and `pending` are already separate), `own-face.tsx` (`wait`) and the face picker (`save` transition) each have one obvious pressed control and need no key.

A shared `WaitButton` is not introduced: the buttons differ in class and content, and adding a child is one line each.

### D6. The 150 ms rule is CSS
The existing loading screen is held back 150 ms by an animation delay so a fast page never flashes it. The same is done here, once, in `seats.css`: the ticket and the small one start hidden and appear with `animation: seats-arrive .2s .15s both`. No timers in JavaScript.

For buttons this means the button is disabled at once and shows the faces 150 ms later.

### D7. Motion
Ported from the mockup: only `transform`, `opacity` and `clip-path` are animated. The ticket's cycle is 4.2 s (a seat every 0.45 s, the stamp at 40%); the small one's is 2.2 s. Easing is the campus `--cs-expo`, with no overshoot.

Under `prefers-reduced-motion` every animation is off and the resting style is the finished pose: seats full, stub stamped. The resting style is the default in the CSS and the animation takes it away, so reduced motion needs no extra rules beyond `animation: none`.

### D8. The slow ticket is driven by the wait's expected length, and ends on a prop
`slow` stretches the cycle so three seats fill across about 25 s and does not repeat; the last seat is ringed and empty. When `own-face.tsx` gets its answer it passes the new picture as `filled`; the seat fills, and after about 0.6 s the component moves to its `done` state. If the wait runs past the 25 s the ticket simply rests with three seats full.

Alternative: a progress bar. Rejected: the time is a guess, and the founder picked the seats.

### D9. One announcement per wait
The ticket's root has `role="status"` and its line is real text; the faces have empty `alt`. `SeatsSmall` is `aria-hidden`; a button's waiting word ("Posting") is what a screen reader hears, and a button with no word (the ticket buttons) gets an `aria-label` while waiting. `LinkWait` is `aria-hidden`, so a page change is announced once, by the ticket.

### D10. The waiting words on buttons
A button with a word keeps a word, in the plain present: "Posting", "Reading", "Saving", "Subscribing", "Keeping", "Marking", with the small one before it and no ellipsis. The small buttons on a ticket (I'm in, Join, Check in) show the small one alone, as in the mockup, with the waiting word as their label for screen readers. Each button gets a `min-width` equal to its resting width so it never gets narrower.

### D12. One line: "Looping you in…"
The founder asked for one standard wording in place of a line per place ("a standard wording would be fine, like 'looping you in...' or something like that", 2026-11-19). The line is a constant in `seats.tsx`, not a prop, so no caller can drift from it. It keeps the ellipsis he wrote. Screen readers hear "Looping you in" (the ellipsis is not read out).

The per-place lines drawn in the placements mockup ("Opening Near you", "Finding you", "Getting the map", "Your pet is next") are dropped. A page that needs to say more says it itself, beside the ticket: Ink keeps its headline "Drawing your pet." and the half-a-minute sentence.

Buttons are a separate thing (D10): the small one has no line, so a button keeps its own short word.

### D11. Where it is built
Two other sessions have uncommitted work in this folder (no-collisions reported it on 2026-11-19), and `components/campus/screen.tsx` and `app/c/campus.css` are the busiest files in the repo. The work is done in a new worktree on its own branch, and merged when those sessions have landed.

## Risks / Trade-offs

- [The bar in the fallback is a copy, not the bar] → It is drawn from the same link list the real bar wrote, in the same classes, so it looks the same; its links are not pressable for the moment the fallback shows. A person who opens the account card and then changes page sees the card close. Moving the bar into a layout (D3, alternative) removes this and is the follow-up.
- [`useLinkStatus` is skipped when a route was prefetched] → Then the fallback shows at once and carries the pressed link's small one itself, from the remembered label. Both paths are checked in the browser (task 8.2).
- [Adding `loading.tsx` changes how campus pages stream] → Per the docs, once a fallback has streamed the response is already 200, so `notFound()` for an unknown campus answers 200 with the not-found page. Check what `/c/nope` returns before and after; if the status matters, keep the lookup above the boundary (task 2.5).
- [The loader could flash on fast pages] → D6. Checked by throttling in the browser and by a test on the stylesheet's delay.
- [Four `<img>` per ticket, three per button] → They are the same small PNGs already used across the page and are cached after first use; on a cold open they are the only images. The first seat's picture gets `fetchpriority="high"`; no preloading of the rest.
- [The slow ticket guesses 25 s] → It rests when it runs out and ends on the real answer (D8); the page still says "about half a minute".
- [Differences from the mockup the founder approved] → Listed so they are not a surprise: (1) every ticket reads "Looping you in…" where the mockup had a line per place (D12), so "After signing in" is the same screen as a cold open; (2) the ticket's map box shows the ticket only until the map's frame reports it has loaded, which is when the frame arrives and not when its tiles finish; (3) no ending animation.
- [Tests that match today's words will fail] → They are updated in the same tasks that change the words; the specs and tests found on 2026-11-19 do not assert any of the six phrases, so this is expected to be small.

## Migration Plan

No data and no flag. It ships with a deploy and is undone by reverting the commit. Order of work keeps every step shippable: the component first, then page-level waits, then parts, then buttons.

## Open Questions

1. **The ending.** The first mockup shows the stub stamping and the school colour flooding in as the page arrives. Wanted? If so it is its own change, likely with View Transitions.
2. **The words on waiting buttons.** The ticket's line is settled (D12). The button words "Posting", "Reading", "Saving", "Subscribing", "Keeping", "Marking" are my wording; the founder saw three of them in the mockup and did not comment on them.
3. **Signed-out visitors.** All four seats are stock animals. Should the last seat be an empty, ringed seat instead, as a nudge to sign in?
4. **The bar into a layout.** Do it next, or leave the remembered copy (D3) in place?

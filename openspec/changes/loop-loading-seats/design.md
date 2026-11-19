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
- The ending from the first mockup (the school colour flooding in). The founder did not like it; the ending is the splat of D13.
- Selling or granting Ink+. D13 only draws its splat.
- An ending on a part of a page or on a button. Those waits end by showing what they were waiting for.
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
A tiny client component, `LinkWait`, placed inside each bar `<Link>` (campus and groups) and inside the campus-swap tickets, shows `SeatsSmall` (D14) while `useLinkStatus().pending` is true. Following the docs' note on layout shift, its box is always there at a fixed size and only its visibility changes.

It covers the gap before the fallback paints, and the case where there is no fallback. It replaces the lime dot (`.lp-wait`) on the groups menu where that still exists.

### D5. Which button was pressed
`CampusScreen` keeps one more piece of state beside `busy`: the key of the control that started the transition (for example `in:<ticket id>`, `invite:<ticket id>:<person id>`). `run` takes the key. A button shows the small one when `busy` and the key is its own; every other button stays disabled without it, as today.

The composer, the plan form (`reading` and `pending` are already separate), `own-face.tsx` (`wait`) and the face picker (`save` transition) each have one obvious pressed control and need no key.

A shared `WaitButton` is not introduced: the buttons differ in class and content, and adding a child is one line each.

### D6. The 150 ms rule is CSS
The existing loading screen is held back 150 ms by an animation delay so a fast page never flashes it. The same is done here, once, in `seats.css`: the ticket and the small one start hidden and appear with `animation: seats-arrive .2s .15s both`. No timers in JavaScript.

For buttons this means the button is disabled at once and shows the faces 150 ms later.

### D7. Motion
Ported from the mockup: only `transform`, `opacity` and `clip-path` are animated. The ticket's cycle is 4.2 s (a seat every 0.45 s; the stub stays blank, D13); the small one's is 2.2 s. Easing is the campus `--cs-expo`, with no overshoot.

Under `prefers-reduced-motion` every animation is off and the resting style is the finished pose: seats full, stub blank. There is no ending under reduced motion (D13). The resting style is the default in the CSS and the animation takes it away, so reduced motion needs no extra rules beyond `animation: none`.

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

### D13. The ending is an ink splat on the stub, drawn above the page
Picked by the founder on 2026-11-19 from `public/demo/mockups-loading-splat-2.html`, row A ("A third ink"), after `mockups-loading-splat.html` ("Stamped is good, but perhaps smaller and higher quality").

**What it is.** The stub is blank for the whole wait; the mockup's looping "It's on" stamp is gone, because the splat is the stamp. When the wait is over: the splat lands on the stub (0.24 s), its drops leave it one after another (16 ms apart), the ticket takes a small knock, and the ticket drops away with the splat on it. The mockup holds the splat for 0.75 s before the drop so it can be looked at; the app holds 0.3 s, about 0.8 s in all, since the page is already there underneath.

**The three splats.** All are plain filled shapes, no filters or gradients, about 76 px across on a 54 px stub. Drops are thrown to the right only, away from the line and the faces.
- Free: the dark pool alone, 62 px, filled with `--cs-ink`, three drops.
- Ink: `inkBlot(seed)` as it is under the member's face: the wide spill in `--cs-field`, the seep, the dark pool in `--cs-action`, with a few more thrown drops.
- Ink+: the Ink splat, plus the four-point spark of `InkMark` filled in the middle and every thrown drop drawn as a spark, in a new token `--cs-third` (Cornell and NYU a warm yellow, Columbia a gold, CUNY an orange, Loop a pink; the mockup's `--hot` values).

The seed is the one the member's face blot uses, so the splat is their own blot. `lib/campus/ink-blot.ts` gains the thrown drops (`flung`) as a separate function so the blot under a face does not change.

**Who gets which.** The plan travels with the face: groups pass it from the layout, campus pages remember it in `last-bar` (D3) beside the face (`viewer.asked` is "has Ink" today). Where the viewer is not known (cold open, shared links, sign-in) the splat is the Free one. Nothing in the app says "Ink+" yet, so the component takes `plan: 'free' | 'ink' | 'plus'` and no caller passes `'plus'` until Ink+ exists.

**How it outlives the fallback.** A Suspense fallback is removed the instant the page is ready, so the ending cannot live in it. A client component, `components/loading/seats-ending.tsx`, is mounted once in the root layout, `app/layout.tsx`, so shared links and every other page have it too. `SeatsTicket` at page size registers itself with a small module (`components/loading/ending.ts`) when it has been visible for 400 ms; when it unmounts it hands over its place on screen (`getBoundingClientRect`), its face and its plan. `SeatsEnding` then draws a copy of the finished ticket at that place in a fixed layer with `pointer-events: none`, plays the ending, and removes itself. The page beneath is live the whole time.

Rules that follow from this:
- A wait that was not visible for 400 ms has no ending (a splat on a ticket nobody saw is noise).
- Only page-sized waits end this way (whole screen, changing page, groups, shared links). A part of a page, the slow ticket (which has its own ending, D8), the sign-in card and buttons do not.
- Under reduced motion `SeatsEnding` draws nothing.
- If the layer has not hydrated when a cold open finishes, there is no ending. That is acceptable.
- The copy is `aria-hidden`; the ending is never announced.

Alternatives considered:
- View Transitions between the fallback and the page. Rejected for now: the API's state in this Next version was not checked, and it would animate the whole page, which is what the founder did not want.
- Holding the page back until the ending has played. Rejected: it makes every wait longer.
- Row B (blue-black ink for Ink+) and row C (three splats). Not picked.

### D14. The small one is "Your blot"
Picked by the founder on 2026-11-19 from `public/demo/mockups-loading-small.html`, row C, over the three faces first specified, a single seat, and a mini ticket. It replaces the three faces everywhere the small one is used.

**What it is.** One face, the viewer's own, and under it a blot that swells and settles on a 1.9 s cycle (from 0.62 of its size, turning 14 degrees, up to full size; its drops fly out as it reaches full size and fade as it settles). `SeatsSmall({ face?, plan?, seed?, line? })`. The blot is drawn 1.2 times the size it has under a face elsewhere in the app, so it shows at 16 px.

**By plan**, the same rule as the ending (D13): with Ink, `inkBlot(seed)` in the school's two inks; on the free plan, and where the viewer is not known, the dark pool alone in `--cs-ink` with no drops. Ink+ is drawn as Ink until there is an Ink+. Where the face is not known it is a free animal.

**Sizes.** 22 px in a button or a row, 44 px in a part of a page. On a button filled with the action colour the dark ink would vanish, so there the loader sits on a round plate of `--cs-paper`.

**In a part of a page** (`line` set): the small one at 44 px with "Looping you in…" in a pill under it, in place of the ticket. This is Near you while it finds the person, and a ticket's map. The slow ticket for drawing a pet (D8) stays a ticket: it is a long wait with its own ending.

**Reduced motion:** the face on its blot at full size, still.

Alternatives, not picked: three faces (row 0), one seat (row A, my own pick for buttons), mini ticket (row B).

### D15. The whole app: one rule, and a check
Founder, 2026-11-19: "the scope is anything that loads, or takes time to load will use one of these". The rule:

| The wait | The loader |
|---|---|
| A whole page (first open, or a page change) | The ticket, and the splat when it ends (D13) |
| A part of a page that arrives after the rest | The small one with the line (D14) |
| A button or control waiting on the server | The small one inside it, with the button's short word if it had one (D10) |
| A long, known wait (drawing a pet) | The slow ticket (D8) |

What that adds to the first draft of this change, found by listing every `useTransition`, `useFormStatus`, `useActionState`, `Suspense`, `loading.tsx` and frame in `app/` and `components/` on 2026-11-19:
- **Groups forms.** `ActionForm` in `components/emba/portal-forms.tsx` is the button behind about 22 files; changing it covers most of them. The rest have their own button: `brief-form`, `link-box`, `resource-box`, `planning-form`, `assistant-review`, `group-note-review`, `memory-proposal-review` under `components/emba/`, and `start-form`, `invitation-paste`, `members-panel` under `app/groups/`.
- **Campus pieces written since:** `add-schools.tsx`, `no-school.tsx`, `on-you.tsx` (its `Suspense` fallback is nothing today; it becomes the small one at 16 px where the counter will be), and the Ink page's frame.
- **Pages with no loading file:** `/`, `/sign-in`, `/m/[token]`, `/c/admin`, `/c/[campus]/post`, `/c/save`, `/privacy`, `/terms`. One `app/loading.tsx` at the root covers any page without a nearer one, so no page can be missed; the nearer ones (`app/c`, `app/groups`, the shared links) stay because they know more (the bar, the face).
- **The older pages.** They have no school colours, so the loaders fall back to the Loop kit's values (D1). Their buttons (`OptIn`, `PlanActions`, `PostForm`, `ShowNameSwitch`, `SlotEditor`, `StartBoard`, `TripView`, `DetailsBox`) take the small one; `app/emba/loading.tsx` takes the ticket. They are done last, and can be dropped without touching the rest if those pages are cut first.

The viewer's face and plan are not known on most of these; the small one then shows a free animal on a plain blot (D14).

**The check.** A test, `lib/__tests__/loading-words.test.ts`, reads every `.tsx` under `app/` and `components/` and fails on: a quoted word ending in "…" inside a file that also has a pending flag, the classes `lp-loading` and `lp-wait`, and a `Suspense` whose fallback is `null` (with a short allow-list, each entry with its reason). It is a net, not a proof: a new wait that shows nothing at all and uses none of these is still possible.

### D11. Where it is built
Two other sessions have uncommitted work in this folder (no-collisions reported it on 2026-11-19), and `components/campus/screen.tsx` and `app/c/campus.css` are the busiest files in the repo. The work is done in a new worktree on its own branch, and merged when those sessions have landed.

## Risks / Trade-offs

- [The bar in the fallback is a copy, not the bar] → It is drawn from the same link list the real bar wrote, in the same classes, so it looks the same; its links are not pressable for the moment the fallback shows. A person who opens the account card and then changes page sees the card close. Moving the bar into a layout (D3, alternative) removes this and is the follow-up.
- [`useLinkStatus` is skipped when a route was prefetched] → Then the fallback shows at once and carries the pressed link's small one itself, from the remembered label. Both paths are checked in the browser (task 8.2).
- [Adding `loading.tsx` changes how campus pages stream] → Per the docs, once a fallback has streamed the response is already 200, so `notFound()` for an unknown campus answers 200 with the not-found page. Check what `/c/nope` returns before and after; if the status matters, keep the lookup above the boundary (task 2.5).
- [The loader could flash on fast pages] → D6. Checked by throttling in the browser and by a test on the stylesheet's delay.
- [Four `<img>` per ticket, one and a small inline drawing per button] → They are the same small PNGs already used across the page and are cached after first use; on a cold open they are the only images. The first seat's picture gets `fetchpriority="high"`; no preloading of the rest.
- [The slow ticket guesses 25 s] → It rests when it runs out and ends on the real answer (D8); the page still says "about half a minute".
- [Differences from the mockup the founder approved] → Listed so they are not a surprise: (1) every ticket reads "Looping you in…" where the mockup had a line per place (D12), so "After signing in" is the same screen as a cold open; (2) the ticket's map box shows the ticket only until the map's frame reports it has loaded, which is when the frame arrives and not when its tiles finish; (3) the ending holds the splat for 0.3 s, not the mockup's 0.75 s, and plays over the page that has already arrived (D13).
- [The ending is drawn over a live page] → It is a small ticket-sized layer that takes no presses and is gone in under a second; it is skipped for short waits and under reduced motion (D13).
- [The splat's colours on each school] → Cornell's red can read like blood, as the founder already accepted for face blots; the third ink is faint on Cornell's light stub outside the splat. Checked per school in task 9.6.
- [The cold open is on the school colour] → the splat there is the Free one in dark ink, which reads on every school's colour.
- [Tests that match today's words will fail] → They are updated in the same tasks that change the words; the specs and tests found on 2026-11-19 do not assert any of the six phrases, so this is expected to be small.

## Migration Plan

No data and no flag. It ships with a deploy and is undone by reverting the commit. Order of work keeps every step shippable: the component first, then page-level waits, then parts, then buttons.

## Open Questions

1. **The ending.** Settled: D13. Still open inside it: the exact shade of the third ink per school (mine, from the mockup), and whether Free members should get a splat at all or it should be an Ink perk.
5. **Free members and the small one.** A plain dark blot is my choice (it matches the free splat); the mockup said "no blot on Free". Either a plain blot or the face alone works.
2. **The words on waiting buttons.** The ticket's line is settled (D12). The button words "Posting", "Reading", "Saving", "Subscribing", "Keeping", "Marking" are my wording; the founder saw three of them in the mockup and did not comment on them.
3. **Signed-out visitors.** All four seats are stock animals. Should the last seat be an empty, ringed seat instead, as a nudge to sign in?
6. **The older pages.** Included because the scope is everything; say if `/emba`, `/b`, `/p`, `/trip`, `/trips` are to be cut instead and task group 12 goes.
4. **The bar into a layout.** Do it next, or leave the remembered copy (D3) in place?

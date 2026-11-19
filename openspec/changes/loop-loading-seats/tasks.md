## 1. Mockups and founder decisions

- [x] 1.1 `public/demo/mockups-loading.html`: three loaders. Founder picks B, "Saving seats" (2026-11-19)
- [x] 1.2 `public/demo/mockups-loading-places.html`: every wait drawn with B. Founder: "this is all beautiful" (2026-11-19)
- [ ] 1.3 Founder approves this change, and answers the four open questions in design.md (the ending, the words on waiting buttons, signed-out seats, the bar into a layout)
- [x] 1.5 Founder sets one standard line for the ticket: "Looping you in…" (2026-11-19, design D12)
- [ ] 1.4 Make a worktree and branch for this work (design D11); do not build in the shared folder

## 2. The loader

- [ ] 2.1 Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` and `.../04-functions/use-link-status.md` again before writing any of section 3 (AGENTS.md)
- [ ] 2.2 Tests first, `components/loading/seats.test.tsx`: the ticket shows "Looping you in…" as text in a `role="status"` and takes no prop that could change it (design D12); four seats; the last seat is `face` when given and a free animal when not; faces have empty `alt`; `slow` rings the last seat and leaves it empty; `filled` puts that picture in it; the small one has three faces and is `aria-hidden`; the same props give the same markup twice (no randomness)
- [ ] 2.3 `components/loading/seats.tsx`: `SeatsTicket` and `SeatsSmall` (design D1, D2, D8, D9)
- [ ] 2.4 `components/loading/seats.css`, ported from `.st`, `.st.slow` and `.sf` in the places mockup: `seats-` class names, `--cs-*` tokens each with the Loop kit's value as fallback, the 150 ms arrival (D6), the resting style as the finished pose and `prefers-reduced-motion` turning every animation off (D7)
- [ ] 2.5 Note what `/c/nope` (an unknown campus) answers today, status and page, to compare after 3.3

## 3. Changing page and opening the app, on the campus pages

- [ ] 3.1 Tests first for `components/loading/last-bar.ts` and `page-wait.tsx`: nothing remembered draws the whole-screen ticket; a remembered bar draws the same links with the pressed one marked and holding the small one, and the ticket under it; the remembered face is the last seat
- [ ] 3.2 `components/loading/last-bar.ts` (a module variable, design D3) and `components/loading/page-wait.tsx`
- [ ] 3.3 `app/c/loading.tsx` renders `PageWait`
- [ ] 3.4 `CampusBar` in `components/campus/screen.tsx` writes its links and the viewer's face to `last-bar`, and its links record their label on click
- [ ] 3.5 `components/loading/link-wait.tsx` (`useLinkStatus`, fixed-size box, `aria-hidden`; design D4), placed in the bar's links and in the swap tickets of `components/campus/swap.tsx`
- [ ] 3.6 Compare `/c/nope` with 2.5. If the status changed and that matters, move the campus lookup above the boundary and say so in design.md

## 4. Groups pages, shared links, sign-in

- [ ] 4.1 `app/groups/loading.tsx`: the ticket in the page's place, with the person's face from the layout. Update the test that covers the groups loading state so the `page-speed` scenario "a loading state appears in the page's place, and the side menu stays" still passes
- [ ] 4.2 `LinkWait` in the groups bar's links (`app/groups/bar.tsx`); remove the lime `.lp-wait` dot where it is still drawn
- [ ] 4.3 `app/e/[token]/loading.tsx`, `app/a/[token]/loading.tsx`, `app/o/[token]/loading.tsx`: the whole-screen ticket. Check each still returns its "not found" page for a bad token
- [ ] 4.4 `components/campus/door-sign-in.tsx` and `app/groups/sign-in`: Clerk's `fallback` is the ticket, in a box the height of the form so the card does not jump
- [ ] 4.5 Remove `.lp-loading` and `@keyframes lp-wait` from `app/loop.css` once nothing uses them (grep first; `app/emba/loading.tsx` is on a retired look and stays as it is)

## 5. One part of a page

- [ ] 5.1 Near you, tests first in `components/campus/near.test.tsx`: while `where` is `wait` after a press, the ticket shows over the map and the find button holds the small one; on `away` and `off` the ticket is gone and today's sentences show; the list stays usable throughout
- [ ] 5.2 `components/campus/near.tsx`: 5.1
- [ ] 5.3 A ticket's map in `components/campus/screen.tsx`: the map's box shows the ticket until the frame's `onLoad`; test with a frame that has not loaded and one that has
- [ ] 5.4 Ink, tests first for `components/campus/own-face.tsx`: `busy` shows the slow ticket with the last seat ringed and the half-a-minute sentence; when the action answers, the new picture fills the seat and then `done` shows; when it fails, the ticket goes and the error shows
- [ ] 5.5 `components/campus/own-face.tsx`: 5.4 (design D8)

## 6. After a press

- [ ] 6.1 Tests first in `app/c/campus-screen.test.tsx`: pressing "I'm in" on one ticket puts the small one in that button only, and the other ticket's button is disabled without it; the same for Join, Check in, Register me, Leave, Mark as used and an invite toggle; after an error the button is pressable again and the error shows
- [ ] 6.2 `components/campus/screen.tsx`: the pressed key beside `busy` (design D5), the small one and a waiting `aria-label` on the pressed control, `min-width` so no button narrows (D10)
- [ ] 6.3 `components/campus/composer.tsx`: "Post it" becomes the small one and "Posting"; test
- [ ] 6.4 `components/campus/plan-form.tsx`: "Fill in" becomes the small one and "Reading", "Save" or "Post it" becomes the small one and "Saving" or "Posting", each only for its own wait; test
- [ ] 6.5 The face picker in `components/campus/screen.tsx`: the picked face holds the small one until the save is back, and goes back to the face before if the save fails; test
- [ ] 6.6 Changing campus in the account card: the pill holds the small one while `moving`; test
- [ ] 6.7 `components/campus/own-face.tsx`: Subscribe and Keep this one hold the small one while `wait`, with "Subscribing" and "Keeping"; test
- [ ] 6.8 Grep `app/` and `components/campus/` for "One moment", "Reading…", "Saving…", "Opening…", "Loading sign-in" and an ellipsis in a button: none left outside the retired pages

## 7. Design notes

- [ ] 7.1 `docs/loop-campus-design.md`: a short "Waiting" section (the two sizes, where each goes, the 150 ms rule, reduced motion), pointing at the two mockups
- [ ] 7.2 `DESIGN.md`, "Motion": one line that the loader is the exception to "nothing else moves on its own", with the link to 7.1

## 8. Check it for real

- [ ] 8.1 `npx tsc --noEmit`, and the tests of every file touched (full run needs `--maxWorkers=3`)
- [ ] 8.2 In the browser with the network throttled, signed in: a cold open; This week to Ink and back; a group from the bar; another campus; each once with the link prefetched and once not (design, Risks). The bar keeps its links each time
- [ ] 8.3 In the browser: I'm in, Post it, Fill in, a face pick, Finding you, a ticket's map. A fast answer (no throttle) flashes nothing
- [ ] 8.4 Reduced motion turned on in the browser: every loader stands still in its finished pose and still says its line
- [ ] 8.5 A phone-width window: the whole-screen ticket and the ticket under the bar fit without sideways scroll
- [ ] 8.6 Each school's colours (Cornell, Columbia, NYU, CUNY, Loop): the stub and the small one's rings read against their backgrounds
- [ ] 8.7 One production build at the end, with no dev server or other build running
- [ ] 8.8 Founder looks at it on the preview and says whether it matches what was approved

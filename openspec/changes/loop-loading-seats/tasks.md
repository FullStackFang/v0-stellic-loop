## 1. Mockups and founder decisions

- [x] 1.1 `public/demo/mockups-loading.html`: three loaders. Founder picks B, "Saving seats" (2026-11-19)
- [x] 1.2 `public/demo/mockups-loading-places.html`: every wait drawn with B. Founder: "this is all beautiful" (2026-11-19)
- [x] 1.3 Founder approves this change, and answers the open questions in design.md (the words on waiting buttons, signed-out seats, the bar into a layout, whether Free gets a splat)
- [x] 1.6 `public/demo/mockups-loading-splat.html` and `mockups-loading-splat-2.html`: the ending. Founder picks "Stamped", then row A, "A third ink" (2026-11-19, design D13)
- [x] 1.5 Founder sets one standard line for the ticket: "Looping you in…" (2026-11-19, design D12)
- [x] 1.4 Make a worktree and branch for this work (design D11); do not build in the shared folder

- [x] 1.7 `public/demo/mockups-loading-small.html`: the small loader. Founder picks row C, "Your blot" (2026-11-19, design D14)

## 2. The loader

- [x] 2.1 Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md` and `.../04-functions/use-link-status.md` again before writing any of section 3 (AGENTS.md)
- [x] 2.2 Tests first, `components/loading/seats.test.tsx`: the ticket shows "Looping you in…" as text in a `role="status"` and takes no prop that could change it (design D12); four seats; the last seat is `face` when given and a free animal when not; faces have empty `alt`; `slow` rings the last seat and leaves it empty; `filled` puts that picture in it; the small one is one face on a blot and is `aria-hidden`: with `plan="ink"` the blot of the given `seed` in two inks, otherwise one plain shape and no drops; with `line` it shows "Looping you in…" under it; the same props give the same markup twice (no randomness)
- [x] 2.3 `components/loading/seats.tsx`: `SeatsTicket` and `SeatsSmall` (design D1, D2, D8, D9)
- [x] 2.4 `components/loading/seats.css`, ported from `.st` and `.st.slow` in the places mockup and `.l-blot` in the small-loader mockup (D14): `seats-` class names, `--cs-*` tokens each with the Loop kit's value as fallback, the 150 ms arrival (D6), the resting style as the finished pose and `prefers-reduced-motion` turning every animation off (D7)
- [x] 2.5 Note what `/c/nope` (an unknown campus) answers today, status and page, to compare after 3.3

## 3. Changing page and opening the app, on the campus pages

- [x] 3.1 Tests first for `components/loading/last-bar.ts` and `page-wait.tsx`: nothing remembered draws the whole-screen ticket; a remembered bar draws the same links with the pressed one marked and holding the small one, and the ticket under it; the remembered face is the last seat
- [x] 3.2 `components/loading/last-bar.ts` (a module variable, design D3) and `components/loading/page-wait.tsx`
- [x] 3.3 `app/c/loading.tsx` renders `PageWait`
- [x] 3.4 `CampusBar` in `components/campus/screen.tsx` writes its links and the viewer's face to `last-bar`, and its links record their label on click
- [x] 3.5 `components/loading/link-wait.tsx` (`useLinkStatus`, fixed-size box, `aria-hidden`; design D4), placed in the bar's links and in the swap tickets of `components/campus/swap.tsx`
- [x] 3.6 Compare `/c/nope` with 2.5. If the status changed and that matters, move the campus lookup above the boundary and say so in design.md

## 4. Groups pages, shared links, sign-in

- [x] 4.1 `app/groups/loading.tsx`: the ticket in the page's place, with the person's face from the layout. Update the test that covers the groups loading state so the `page-speed` scenario "a loading state appears in the page's place, and the side menu stays" still passes
- [x] 4.2 `LinkWait` in the groups bar's links (`app/groups/bar.tsx`); remove the lime `.lp-wait` dot where it is still drawn
- [x] 4.3 `app/e/[token]/loading.tsx`, `app/a/[token]/loading.tsx`, `app/o/[token]/loading.tsx`: the whole-screen ticket. Check each still returns its "not found" page for a bad token
- [x] 4.4 `components/campus/door-sign-in.tsx` and `app/groups/sign-in`: Clerk's `fallback` is the ticket, in a box the height of the form so the card does not jump
- [x] 4.5 Remove `.lp-loading` and `@keyframes lp-wait` from `app/loop.css` once nothing uses them (grep first; `app/emba/loading.tsx` changes in 12.1)

## 5. One part of a page

- [x] 5.1 Near you, tests first in `components/campus/near.test.tsx`: while `where` is `wait` after a press, the small one and its line show over the map and the find button holds the small one; on `away` and `off` it is gone and today's sentences show; the list stays usable throughout
- [x] 5.2 `components/campus/near.tsx`: 5.1
- [x] 5.3 A ticket's map in `components/campus/screen.tsx`: the map's box shows the small one and its line until the frame's `onLoad`; test with a frame that has not loaded and one that has
- [x] 5.4 Ink, tests first for `components/campus/own-face.tsx`: `busy` shows the slow ticket with the last seat ringed and the half-a-minute sentence; when the action answers, the new picture fills the seat and then `done` shows; when it fails, the ticket goes and the error shows
- [x] 5.5 `components/campus/own-face.tsx`: 5.4 (design D8)

## 6. After a press

- [ ] 6.1 Tests first in `app/c/campus-screen.test.tsx`: pressing "I'm in" on one ticket puts the small one in that button only, and the other ticket's button is disabled without it; the same for Join, Check in, Register me, Leave, Mark as used and an invite toggle; after an error the button is pressable again and the error shows
- [x] 6.2 `components/campus/screen.tsx`: the pressed key beside `busy` (design D5), the small one and a waiting `aria-label` on the pressed control, `min-width` so no button narrows (D10)
- [x] 6.3 `components/campus/composer.tsx`: "Post it" becomes the small one and "Posting"; test
- [x] 6.4 `components/campus/plan-form.tsx`: "Fill in" becomes the small one and "Reading", "Save" or "Post it" becomes the small one and "Saving" or "Posting", each only for its own wait; test
- [x] 6.5 The face picker in `components/campus/screen.tsx`: the picked face holds the small one until the save is back, and goes back to the face before if the save fails; test
- [x] 6.6 Changing campus in the account card: the pill holds the small one while `moving`; test
- [x] 6.7 `components/campus/own-face.tsx`: Subscribe and Keep this one hold the small one while `wait`, with "Subscribing" and "Keeping"; test
- [x] 6.8 Grep `app/` and `components/campus/` for "One moment", "Reading…", "Saving…", "Opening…", "Loading sign-in" and an ellipsis in a button: none left anywhere (the test of 13.1 is the proof)

## 9. The ending (design D13)

- [x] 9.1 Tests first in `lib/__tests__/campus-ink-blot.test.ts`: the thrown drops of a splat are the same for the same seed, all lie to the right of the pool (none over the line or faces), and `inkBlot` gives what it gave before
- [x] 9.2 `lib/campus/ink-blot.ts`: the thrown drops, as their own function
- [x] 9.3 `--cs-third` for each school in `app/c/campus.css` (values from the mockup's `--hot`), with a fallback in `seats.css`
- [x] 9.4 Tests first for `components/loading/seats-ending.tsx` and `ending.ts`: free draws one dark shape and no school colour; ink draws the blot of the given seed with no spark; plus draws the spark and spark drops in the third ink; a ticket seen for under 400 ms hands nothing over; reduced motion draws nothing; the layer is `aria-hidden` and takes no presses; it removes itself when the animation ends
- [x] 9.5 `ending.ts`, `seats-ending.tsx` and the ending's rules in `seats.css` (ported from `.splat`, `land`, `fly`, `knock` in the round 2 mockup, with the 0.3 s hold); the page-sized `SeatsTicket` registers and hands over; mount `SeatsEnding` in `app/c/layout.tsx` and `app/groups/layout.tsx`; `last-bar` and the groups layout pass the plan and the blot's seed. Remove the looping stamp from the ticket (the stub stays blank)
- [ ] 9.6 In the browser with the network throttled: the ending on a page change, a groups page and a cold open, as a free member and as a member with Ink, in each school's colours; a fast page shows no ending; the page beneath takes a press during it; reduced motion shows none. Force `plan="plus"` once to look at the Ink+ splat

## 10. Groups pages: every button and form (design D15)

- [ ] 10.1 Tests first for `ActionForm` (`components/emba/portal-forms.tsx`): while pending the button holds the small one and "Saving", keeps its width, and cannot be pressed; after an error it reads its label again
- [x] 10.2 `ActionForm`: 10.1. Then open three of the pages that use it (team, organize, resources) and check nothing else relied on the old words
- [x] 10.3 The forms with their own button, test then change, one at a time: `brief-form`, `link-box`, `resource-box`, `planning-form`, `assistant-review`, `group-note-review`, `memory-proposal-review` (`components/emba/`); `start-form` ("Creating"), `invitation-paste` ("Accepting"), `members-panel` (`app/groups/`)
- [x] 10.4 The groups layout passes the person's face, plan and blot seed to these through one small context, so the small one is theirs and not a stock animal

## 11. Everything else on the current look (design D15)

- [x] 11.1 `app/loading.tsx`: the whole-screen ticket, for any page with no nearer loading file. Check `/`, `/sign-in`, `/m/[token]`, `/c/admin`, `/c/[campus]/post`, `/c/save` each show it when slow, and that a bad address still answers with its not-found page
- [x] 11.2 `components/campus/on-you.tsx` and its two `Suspense` fallbacks (`app/c/week.tsx`, `app/c/site-bar.tsx`, `app/groups/layout.tsx`): the small one at 16 px in the counter's place; test that the bar does not change width when the count arrives
- [x] 11.3 `components/campus/add-schools.tsx` and `no-school.tsx`: their buttons hold the small one; test
- [x] 11.4 The Ink page's frame (`app/c/ink/page.tsx`): the small one with its line until the frame has loaded
- [x] 11.5 Mount `SeatsEnding` in `app/layout.tsx` (not in the two section layouts) and check the ending on a shared link

## 12. The older pages (design D15; drop this group if they are cut)

- [x] 12.1 `app/emba/loading.tsx`: the ticket, in the Loop colours
- [ ] 12.2 `OptIn`, `PlanActions`, `PostForm`, `ShowNameSwitch`, `SlotEditor`, `StartBoard`, `TripView`, `DetailsBox`: each waiting button holds the small one; one test each
- [ ] 12.3 Look at one page of each in the browser (`/emba`, `/b/…`, `/p/…`, `/trip/…`, `/trips/new`): the loader reads on that page's background

## 13. The check that keeps it so (design D15)

- [x] 13.1 `lib/__tests__/loading-words.test.ts`: fails on a waiting word with an ellipsis, on `lp-loading` or `lp-wait`, and on a `Suspense` with a `null` fallback outside its allow-list. Write it first and watch it fail on today's code, listing every file it names; that list is the checklist for groups 6, 10, 11 and 12
- [x] 13.2 It passes once those groups are done, with every allow-list entry explained in a comment

## 7. Design notes

- [x] 7.1 `docs/loop-campus-design.md`: a short "Waiting" section (the two sizes, where each goes, the 150 ms rule, the ending and its three splats, reduced motion), pointing at the mockups
- [x] 7.2 `DESIGN.md`, "Motion": one line that the loader is the exception to "nothing else moves on its own", with the link to 7.1

## 8. Check it for real

- [x] 8.1 `npx tsc --noEmit`, and the tests of every file touched (full run needs `--maxWorkers=3`)
- [ ] 8.2 In the browser with the network throttled, signed in: a cold open; This week to Ink and back; a group from the bar; another campus; each once with the link prefetched and once not (design, Risks). The bar keeps its links each time
- [ ] 8.3 In the browser: I'm in, Post it, Fill in, a face pick, Finding you, a ticket's map. A fast answer (no throttle) flashes nothing
- [ ] 8.4 Reduced motion turned on in the browser: every loader stands still in its finished pose and still says its line
- [ ] 8.5 A phone-width window: the whole-screen ticket and the ticket under the bar fit without sideways scroll
- [ ] 8.6 Each school's colours (Cornell, Columbia, NYU, CUNY, Loop): the stub and the small one's rings read against their backgrounds
- [ ] 8.7 One production build at the end, with no dev server or other build running
- [ ] 8.8 Founder looks at it on the preview and says whether it matches what was approved

## 0. Stay clear of Conga (D7)

- [ ] 0.1 Before every commit of this change: `git diff --cached --name-only` lists nothing under `public/conga/`, `app/conga/` or `scripts/conga-*`, and `public/fonts/Archivo.ttf` and every `public/animals/NN.png` are unchanged
- [ ] 0.2 After the faces' WebP files exist (3.1): `app/conga/sim.test.ts` and `app/conga/route.test.ts` pass, and `scripts/conga-atlas.mjs`'s file filter still finds the same list of faces (count the PNGs; do not run the script)

## 1. The font as WOFF2 (D1)

- [ ] 1.1 Convert `public/fonts/Archivo.ttf` to `public/fonts/Archivo.woff2` with a converter run through `npx`; write down its size. If it is over 100 kB, stop and report before going on
- [ ] 1.2 Compare the two files: same axes and ranges (weight 100 to 900, width 62% to 125%) and the same glyph count
- [ ] 1.3 Point `app/layout.tsx` and `app/global-error.tsx` at the WOFF2; leave the TTF in place for the tests and Conga
- [ ] 1.4 On localhost, look at the front door's wide headline and a condensed label; check the font request is the WOFF2
- [ ] 1.5 Run the tests that name the font file, `tsc --noEmit`, eslint on the changed files; commit by path

## 2. The framed mockups use the app's font (D5)

- [ ] 2.1 In `public/demo/mockups-premium.html` and `public/demo/mockups-imprint.html`, replace the Google Fonts link with an `@font-face` for `/fonts/Archivo.woff2` covering the same weights and widths
- [ ] 2.2 Open `/c/ink` and `/organizers` on localhost; check the text looks the same and no request leaves for a font host; commit by path

## 3. Faces as WebP (D2)

- [x] 3.1 Add a script under `scripts/` that writes `NN.webp` beside each `public/animals/NN.png` with `sharp` (192 px, alpha kept); run it and write down the total size before and after
- [ ] 3.2 Build `/demo/mockups-faces-webp.html`: each face as PNG beside WebP at 26, 32, 38 and 96 px on the light and dark grounds. Stop and hand it to the owner; go on after his yes
- [ ] 3.3 Test first: every PNG in the set has a WebP that decodes to the same picture within a small tolerance; `animal()` returns a `.webp` address
- [ ] 3.4 Change `animal()` in `lib/campus/animals.ts`; widen the faces' cache header in `next.config.ts` to both endings; leave `outputFileTracingIncludes` on the PNGs
- [ ] 3.5 Find every place that writes a face's address without `animal()` (grep for `/animals/`) and every test that expects `.png`; fix each
- [ ] 3.6 Check a person's own animal still draws from the PNG (`lib/campus/custom-face.ts`) by its test
- [ ] 3.7 Run the affected tests, type check, lint; commit by path

## 4. Static legal pages (D3)

- [x] 4.1 Confirm by reading that nothing in `Legal`'s tree other than `CampusShell` reads cookies or headers on the server or uses a Clerk hook (`TopBar` with `account={null}`, `SiteFoot`, `LegalSpy`, and the root layout's `FreshWait`, `SeatsEnding`, `Seen`)
- [ ] 4.2 Find what `Kit` shows on its own in the browser for a signed-in person given the signed-out defaults. If the colours would differ from today, stop and ask the owner (design.md, Open Question 5)
- [ ] 4.3 Test first: rendering `Legal` makes no call to `campusViewer` and renders no `ClerkProvider`
- [ ] 4.4 Give `Legal` a shell that asks nothing: the campus stylesheet and `Kit` with the signed-out defaults
- [ ] 4.5 Run the affected tests, type check, lint; commit by path

## 5. The pitch's data kept for a minute (D4)

- [x] 5.1 Read the caching guide for this Next.js under `node_modules/next/dist/docs/` and choose the API that wraps one data function for 60 seconds without changing how other pages render; note the choice in design.md
- [x] 5.2 Test first: two renders of `DoorPage` inside a minute read the schools' weeks once; a signed-in person with a campus is still redirected by `FrontDoor`
- [x] 5.3 Move the read of the example tickets into one function and keep its result for a minute
- [x] 5.4 Run `app/front-door.test.tsx` and `app/campus-door.test.tsx`, type check, lint; commit by path

## 6. Proof

- [ ] 6.1 Make sure no dev server or other build is running, then run one production build; the route table marks `/terms` and `/privacy` static
- [ ] 6.2 Start the built app; load `/`, `/terms`, `/c/ink` and `/c/doodles` with an empty cache at 390 px and write the byte table (total, font, scripts, images) into design.md beside the numbers in the proposal
- [ ] 6.3 On `/terms`, check that no sign-in script is requested and the console is clean
- [ ] 6.4 After the owner pushes: check the response headers of `/terms` in production (served from the cache) and that the production log shows no new errors

## 7. Waiting for the owner (not part of this change until answered)

- [ ] 7.1 Ask: look into sign-in scripts on Doodles, Ink and organizers for signed-out visitors (Open Question 1)
- [ ] 7.2 Ask: a domain, so sign-in can move to a Clerk production instance and lose the "Development mode" label (Open Question 2)
- [ ] 7.3 Ask: the "Mockup … placeholders" banner on `/c/ink` (Open Question 3)
- [ ] 7.4 Ask: the front door's headline at laptop width (Open Question 4)

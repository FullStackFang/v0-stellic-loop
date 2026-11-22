## Context

Next.js 16 (App Router) on Vercel in `pdx1`; sign-in is Clerk; every page is rendered per request (`force-dynamic`, or dynamic because it reads cookies). The root layout loads Archivo with `next/font/local`, which serves the file it is given unchanged and preloads it.

What the review of 2026-11-21 found, and how sure each finding is:

| Finding | How it was checked |
|---|---|
| Font: 235 kB over the wire on every page; the same family as WOFF2 is 88 kB | Measured in a browser against production |
| Sign-in scripts: about 350 kB on every page, the form's code included on `/terms` | Measured |
| `/terms` answers `private, no-store`, `X-Vercel-Cache: MISS`, from `pdx1` | Response headers |
| `/terms` is dynamic because `CampusShell` calls `campusViewer()` | Read in code; to be proved by the build's route table (task 3.1) |
| A face is 192 x 192 PNG, 30 to 60 kB; `41.png` as WebP (quality 82) is 12 kB | Measured with `sharp` |
| `/c/ink` and `/organizers` fetch Archivo again from Google Fonts | Measured (two font requests); the frames' sources are `/demo/mockups-premium.html` and `/demo/mockups-imprint.html` |
| Layout shift is 0 and nothing overflows at 390 px on the public pages | Measured |

Two findings from the first pass of the review were wrong and are not here: the inputs that set `outline: 0` each draw a focus ring with `box-shadow`, and the bar at the top of the Terms sheet is its reading-progress bar (`.cs-lg-read`).

Constraints:
- `AGENTS.md`: this Next.js differs from older ones; read the guide under `node_modules/next/dist/docs/` before using a caching API.
- A change to how a page looks needs a mockup and the owner's yes first. Nothing here is meant to change a look; D2 has a check for it.
- Other sessions hold uncommitted work under `public/conga` and `scripts/`. Commit by path.
- One production build, at the end.

## Goals / Non-Goals

**Goals:**
- A smaller first visit on every page, with no change to what any page shows.
- Terms and Privacy served from the CDN.
- The signed-out front door no longer reads every school's week on each visit.

**Non-Goals:**
- Caching anything that depends on who is looking. Every signed-in page stays per request.
- Removing the sign-in provider from pages that show an account control (Open Question 1).
- The campus stylesheet in the root layout (145 kB raw, about 30 kB compressed): it is there so the error page has its styles, and the saving is small.
- The remaining sequential reads in `lib/campus/screen.ts`: a database change, like the two before it, and not timed in production.
- Conga's own copy of the font (`public/conga/index.html`), which another session is working on.

## Decisions

### D1. The font becomes WOFF2, beside the TTF

Convert `public/fonts/Archivo.ttf` to `public/fonts/Archivo.woff2` once, with a converter run through `npx` (not added to `package.json`). `app/layout.tsx` and `app/global-error.tsx` point at the WOFF2. The TTF stays: `app/c/campus-screen.test.tsx` and Conga read it.

- Why: WOFF2 is a lossless container for the same tables, so both axes (weight 100 to 900, width 62% to 125%) and every glyph survive. Every browser the app supports reads it.
- Proof: the converted file is under 100 kB on disk. If it is not, stop and report: Google's build of the family is 88 kB, but it may be subsetted to Latin, so the full file could be larger. Compare the axes and the glyph count of the two files before switching.
- Found (2026-11-21): converted with `wawoff2` (from a scratch folder, not the repo), the WOFF2 is **189 kB**, over the limit. Same axes, 834 glyphs and 653 characters in both; only the `DSIG` signature table is dropped. The font is all Latin (basic, Latin-1, Extended A/B, Vietnamese, symbols); there is no other script to drop. Google's 88 kB is the basic-Latin slice of the family, with the other slices fetched only when a page uses one of their letters. Stopped for the owner: ship the 189 kB file (235 kB → 189 kB on the wire), or split it the same way. **The owner chose the whole file**; the spec's limit is 190 kB. On localhost the front door and Terms each fetch one font, the WOFF2, 185 kB on the wire.
- Alternative considered: subsetting to Latin. Rejected for now: names in other scripts would fall back to a system font, which is a visible change.
- Alternative considered: `next/font/google`. Rejected: it fetches at build time and the family is already in the repo under its licence.

### D2. Faces are WebP; the PNGs stay

A script under `scripts/` writes `NN.webp` beside each `public/animals/NN.png` with `sharp` (same 192 px, alpha kept, quality chosen by D2's check). `animal()` in `lib/campus/animals.ts` returns the `.webp` address. The cache header in `next.config.ts` covers both endings. The PNGs remain because `lib/campus/custom-face.ts` reads them from disk as the base for a person's own animal (`outputFileTracingIncludes`), and Conga's sprite sheets are built from them.

- Why one function: every face on every page gets its address from `animal()`; there is no second place to change.
- Check before switching: a page under `/demo/` that draws each face twice at the sizes the app uses (26, 32, 38 and 96 px, on the light and dark grounds), PNG beside WebP, for the owner to look at. If any face shows a difference, raise the quality or use lossless for that face.
- Made (2026-11-21) by `scripts/animals-webp.mjs` at quality 85, alpha lossless: the 48 faces go from 1477 kB to 317 kB (3 to 12 kB each). Against its PNG, weighting colour by opacity, each face differs by under 2 of 255 on average; the largest single-pixel difference is 52 to 74, on the premium faces' edges (39 to 46). Side by side at `/demo/mockups-faces-webp.html`, waiting for the owner.
- When a face is redrawn, its WebP must be made again: the script is run as part of the same recipe, and a test fails when a PNG has no WebP or is newer in content than its WebP (compare by decoding both, not by date).
- Alternative considered: `next/image`. Rejected: it adds an optimizer request per face and per size, and a spend, for pictures that never change size.

### D3. Legal pages get a shell that asks nothing

`Legal` stops using `CampusShell` (which awaits `campusViewer()`, a cookie read) and uses a plain shell: the campus stylesheet and `Kit` with the signed-out defaults (`own="loop"`, any colours allowed), and no `ClerkProvider`. `Legal` already passes `account={null}` to `TopBar`, so nothing in it needs the provider.

- Why: with no cookie read, the two pages can be built once. With no provider, they load no sign-in scripts.
- What changes for a person: someone signed in who opens Terms sees it in Loopd's own colours, or the colours their browser last wore, not colours looked up from their school on the server. To be confirmed while building: what `Kit` does on its own in the browser. If a signed-in person would see a different colour than today, that is a look change and goes to the owner first (Open Question 5).
- Found (2026-11-21): there is a difference. `Kit` and its pre-paint script (`lib/campus/kit-script.ts`) show the pick kept in the browser if there is one, or else `own`. Today `own` is the member's school's colours; on a page built once it can only be `loop`. So a signed-in member who never picked colours sees their school's colours on Terms today, and Loopd's after this change. Someone who picked colours sees them either way. A way to keep today's look: on these two pages only, fall back to the colours the browser last wore (`loop-kit-worn`, which the script already writes) before Loopd's. Stopped for the owner (Open Question 5).
- Proof: after the one build, the route table marks `/terms` and `/privacy` static, the response is served from the CDN, and the page's requests include no Clerk script.
- To check first: nothing else in the tree (`SiteFoot`, `LegalSpy`, the root layout's `FreshWait`, `SeatsEnding`, `Seen`) reads cookies or headers on the server or uses a Clerk hook.

### D4. The pitch's data is kept for a minute

`DoorPage` builds one example ticket per school from `listCampuses`, `weekListings` and `campusRewards`. That result (titles, times, reward words; no person) is kept for 60 seconds across requests. The page itself stays per request: `FrontDoor` still calls `campusViewer()` first and redirects a signed-in person.

- Which API: decided after reading the caching guide in `node_modules/next/dist/docs/` for this version (`'use cache'` needs a config flag that would touch every page; the older `unstable_cache` may be the smaller step). Only the data function is wrapped, with the minute as its lifetime.
- Chosen (2026-11-21): `unstable_cache(pitchTickets, ['door-pitch'], { revalidate: 60 })` in `app/door.tsx`. The app has no `cacheComponents` flag, and the guide (`caching-without-cache-components.md`, `unstable_cache.md`) keeps `unstable_cache` for non-`fetch` data in that model. Its value is stored as JSON; a `DoorSchool` is strings, numbers and nulls, so it survives unchanged (a test checks). Outside a Next server it throws, so `app/campus-door.test.tsx` puts a stand-in in its place. After the minute, the first visitor is still shown the kept tickets while they are read again, so a cancelled event can show for a little over a minute: one more visit, not one more minute.
- Why a minute: an event posted or cancelled shows on the pitch within a minute, and a burst of visitors costs one read.
- `ticket()` formats times with `now`; the kept value includes those words, so a label such as "Today" can be up to a minute stale at midnight. Accepted.
- Alternative considered: making `/` static for signed-out visitors. Rejected: the same address must redirect a signed-in person, and that needs the request.

### D5. The framed mockups use the app's font

`public/demo/mockups-premium.html` and `public/demo/mockups-imprint.html` replace their Google Fonts link with an `@font-face` for `/fonts/Archivo.woff2`. Same family, so no visual change; one fewer download and no request to a third party from the app's pages.

### D6. Order and proof

Order: D1, D5, D2, D3, D4. Each is its own commit. After all five, one production build, then the byte table in the proposal is measured again on a preview or production and written into this file. The measuring script loads a page with an empty cache at 390 px and sums transferred bytes by kind.

### D7. Nothing here touches Conga

`conga-smooth-followups` is in progress and edits `public/conga/index.html` only. This change shares no file with it and leaves alone everything the game reads (checked 2026-11-21):

| What Conga uses | What this change does |
|---|---|
| `public/conga/**` (page, scripts, sprite sheets) | Never edited, never committed |
| `/fonts/Archivo.ttf`, named in the page's own `@font-face`, and its `loadingdone` event | The TTF stays at the same address, unchanged; the WOFF2 is a new file beside it |
| `public/animals/NN.png`, read by `scripts/conga-atlas.mjs` | The PNGs stay, same names. The script takes only names matching `NN.png`, so a `NN.webp` beside each is not picked up and the sheet's order does not move |
| An animal's place on the sheet (`lib/campus/conga.ts`, a number, not an address) | Unchanged: `animal()`'s address is not used by the game |
| A made animal's address (`customFace`, `/animals/custom/…`) | Unchanged |
| `app/conga/route.ts`, `app/conga/*.test.ts`, `scripts/conga-*.mjs` | Not edited |

`next.config.ts` is edited for the faces' cache header only; its Conga lines (the redirect, the sprite sheets' header, `outputFileTracingIncludes` for `/conga`) are not touched. If Conga later moves to the WOFF2, that is one line in its own page, for that work to make.

## Risks / Trade-offs

- [The WOFF2 drops an axis or glyphs] → Compare axes and glyph counts before switching; look at the front door's wide headline and a condensed label.
- [A WebP face looks softer at small sizes] → The side-by-side page, seen by the owner, before `animal()` changes.
- [A redrawn PNG leaves a stale WebP] → The test in D2.
- [A static Terms page shows different colours to a signed-in person] → Confirmed while building; a difference goes to the owner before it lands.
- [A cached pitch shows a cancelled event] → For at most a minute, and the pitch is an example ticket, not a way to join.
- [`ClerkProvider` is needed by something on the legal pages after all] → The build and a load of both pages with the console open; if so, keep the provider there and keep only the static part.
- [Byte savings do not show as time saved] → The proposal claims bytes, not seconds. Seconds are measured after, on a normal connection.

## Migration Plan

No schema change. Each decision is one commit on local `main`; the owner pushes. Rollback is reverting that commit. The WebP files and the WOFF2 are additions, so an older deployment keeps working.

## Open Questions

For the owner. Each is outside this change until answered.

1. **Sign-in scripts on other signed-out pages.** Doodles, Ink and organizers load about 350 kB of Clerk's scripts for a visitor who is not signed in. Removing the provider there needs a check of everything that uses it (the bar's account, sign-out, the door's sign-in card). Want that looked into as a follow-up?
2. **"Development mode" on the sign-in card.** Production signs in through a Clerk development instance, so the orange label shows under "Secured by Clerk". A production instance needs a domain of your own (Clerk does not allow one on `vercel.app`). Is a domain planned?
3. **The banner on `/c/ink`.** Every visitor sees a black "Mockup. Prices, limits, people and places are placeholders" band above the Ink page. Keep it while Ink is a field test, or hide it when the page is shown inside the app?
4. **The front door's headline on a laptop.** In a screenshot at 1280 px the school name ("Cornell.") was drawn much narrower than "Go together". If that is the rolling name caught mid-roll, nothing to do. Worth a look on your screen.
5. **Colours on Terms and Privacy when signed in** (only if D3's check finds a difference): Loopd's own colours there for everyone?

## Why

A first visit to any page downloads about 1 MB, and most of it is the same on every page: an uncompressed font, the sign-in scripts, and animal pictures in a heavy format. Pages that are the same for everyone (Terms, Privacy, the signed-out pitch) are still rendered in Portland for every visitor and never cached. The last two speed changes (`loop-faster-pages`, `loop-faster-signed-in-pages`) cut database statements; this one cuts what the browser downloads and what the server renders for no reason.

Measured on 2026-11-21 against production (`v0-stellic-loop.vercel.app`), phone-sized screen, empty cache. Byte counts are exact; the connection was slow that day, so no timings are quoted.

| Page | Total | Font | Scripts | Images |
|---|---|---|---|---|
| `/` signed out | 1152 kB | 235 kB | 704 kB | 127 kB |
| `/terms` | 945 kB | 235 kB | 530 kB | 101 kB |
| `/c/ink` | 1335 kB | 323 kB (two copies) | 661 kB | 226 kB |
| `/c/doodles` | 1598 kB | 235 kB | 661 kB | 163 kB, plus 447 kB of video |

Signed-in pages were not measured (no sign-in was available to the review); the font and picture savings apply to them too.

## What Changes

- **The font is served as WOFF2.** `public/fonts/Archivo.ttf` is 659 kB on disk and 235 kB over the wire, preloaded on every page. The same variable font as WOFF2 is about 90 kB. Same glyphs, same weight and width ranges, no visual change.
- **Animal faces are served as WebP.** The 48 faces are 192 px PNGs of 30 to 60 kB. One re-encoded at the same size came to 12 kB. The PNGs stay on disk, because drawing a person's own animal reads them.
- **Terms and Privacy are static.** They are built once and served from the CDN, with no sign-in read and no sign-in scripts. Today each is rendered per request only because the shell they sit in reads the sign-in to choose colours.
- **The signed-out pitch's data is kept for a minute.** The front door reads every school's week and rewards on each visit to draw the example tickets. That data names no person and is the same for everyone. A signed-in person is still recognised and sent on to their campus on every request.
- **The Ink and organizers frames use the app's font.** The mockup pages inside them fetch a second copy of Archivo from Google Fonts (88 kB, and a request to a third party).

Not part of this change until the owner answers (design.md, Open Questions):

- sign-in scripts on other signed-out pages (Doodles, Ink, organizers), which need a closer look at what uses them;
- the "Development mode" label on the production sign-in card;
- the "Mockup … placeholders" banner shown to every visitor on `/c/ink`;
- the school name in the front door's headline looking squeezed on a laptop.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `page-speed`: adds requirements for the font's format and size, the animal faces' format, the legal pages being static and free of sign-in code, the signed-out pitch's data being read at most once a minute, and the framed mockups using the app's font.

## Impact

- `public/fonts/` (a new `Archivo.woff2`; the TTF stays for the tests and for Conga), `app/layout.tsx`, `app/global-error.tsx`.
- `public/animals/` (a `.webp` beside each `.png`), a small script under `scripts/` that makes them with `sharp` (already a dependency), `lib/campus/animals.ts` (`animal()`), `next.config.ts` (the cache header for faces).
- `components/Legal.tsx`, `components/campus/shell.tsx` (a shell that reads no sign-in), `app/terms/page.tsx`, `app/privacy/page.tsx`.
- `app/door.tsx` (the pitch's read).
- `public/demo/mockups-premium.html`, `public/demo/mockups-imprint.html`.
- Tests that name a face's address or the font file.
- No migration and no new runtime dependency. The font is converted once with a tool run through `npx`.
- Other sessions have uncommitted work under `public/conga` and `scripts/`: Conga's own copy of the font is left to that work, and commits name their files.

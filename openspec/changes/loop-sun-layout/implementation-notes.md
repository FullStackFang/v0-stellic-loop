# Implementation and verification

Implemented on `feat/loop-sun-layout`, 2026-11-03. Tasks 1–4 and local browser checks are complete. The change is not archived or deployed.

## Decisions

- The approved configurable label is `board.steward_label`, defaulting to `the space steward`. Migration 0008 updates the existing cohort to `the EMBA office`; the development seed uses the same label.
- Archivo is self-hosted through `next/font/local`, with its variable width axis retained. Counts compute to `"wdth" 62`. The OG renderer requires a static instance, generated from the same font at weight 900, width 96; the OFL license is bundled.
- Formed, dated plans retain a quiet “Can't make it” action alongside the calendar link so members can drop after formation. Undated plans do not expose a calendar link that would return 404.
- Explicit slot edits disable legacy day voting. Failed post replays after phone verification preserve the verified session and return the user to an editable form.

## Evidence

- Full Vitest suite: 26 files, 228 tests passed. After adding two final regression cases and the seed-label assertion, the affected three suites passed all 16 tests.
- TypeScript, production build, ESLint, `git diff --check`, and strict OpenSpec validation passed.
- Local PGlite applied all migrations. Tests cover automatic formation, concurrent threshold taps, invalid dates, immutable formed slots, legacy slot conversion, private names, and membership preference isolation.
- Chrome at 390px: open, formed by fourth tap, didn't form, past, night, rain, space/expanded Wrapped up, Your plans/toggle persistence, posting, and laptop frame inspected against the Sun mockups. No application page errors observed. Main pages and noon/night plans fit at 320px.
- Archivo loaded with the count's width axis at 62. Axe returned zero violations on noon and night plan pages.
- With JavaScript disabled, home, space, Your plans, and post pages returned rendered content; noon and night plan HTML included tint, shadow, and sun/moon position variables.
- Rain used a local-only fetch fixture, not a production override. Its canvas animated normally; reduced motion hid the canvas and disabled cloud animation. The fixture was removed from the running server after verification.
- The production OG route returned HTTP 200, `image/png`; the rendered image was inspected.
- Screenshots and temporary browser scripts are in the ignored `.playwright-mcp/sun-*` files. The original `public/demo/` mockups were not edited.

## Founder steps remaining

1. Apply `supabase/migrations/0008_loop_sun.sql` to the hosted project before deploying this code.
2. Set the cohort board's intended `lat` and `lon`; its steward label is set by the migration.
3. Run the hosted `npm run test:db` checks in the configured test project.
4. Merge/deploy and verify a live plan link's Sun unfurl.

Tasks 5.1 and 5.5 remain unchecked because those hosted checks have not run. The local portion of 5.1 is green.

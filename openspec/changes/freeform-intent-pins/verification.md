# Verification and delivery

## Completed

- OpenSpec strict validation: passed.
- `npm test -- --maxWorkers=2`: 29 files, 242 tests passed.
- `npx tsc --noEmit`: passed after correcting a Testing Library option type.
- Targeted ESLint across changed components, parser, actions and tests: passed.
- `git diff --check`: passed (repository CRLF notices only).
- Real local Next.js + PGlite browser flow: composed an intent, edited a custom pin, posted as a signed-in local fixture, reloaded, removed a saved preference, saved and reloaded again. No browser page errors.
- Initial post action bottom: 592.75px at 320×667; 626.77px at 390×844; 702.77px at 1440×900. No horizontal overflow. Screenshots visually inspected.
- Integration tests cover phone verification replay, malformed metadata before OTP, preservation on partial slot edits, ownership, formed-plan refusal and fresh version counts.
- Component tests cover keyboard editing, focus return, pin removal and explicit day correction.

The first repeat browser run reused a consumed single-use demo login token and waited at identity. The harness now issues a fresh token only in the isolated local database; the corrected full browser run passed.

## Delivery status

Implementation and migration are in the working tree. Local preview: `http://localhost:3010/b/emba27/new`.

Production has not been changed by this work. Apply `supabase/migrations/0009_intent_preferences.sql` to the existing Supabase project before deploying the app changes. No authenticated Supabase connector is available in this session and no SUPABASE_ACCESS_TOKEN is present. The app's local database was migrated; no production records were used as fixtures.

The migration adds a defaulted metadata column and shape constraint. Old code ignores the column, so an application rollback can leave it in place. No new Data API grants or RLS policies are introduced.

## Product boundary

Weekly and fortnightly are saved preferences. This change does not generate recurring occurrences, automatically RSVP people, compute compatibility, or sync calendars. The composer and plan page say that each next plan requires a fresh count.

## Review notes

The React pass checked native input behavior, derived state, stable hook order, server action authorization, pending-state controls and focus handling. The source remains a native textarea; the exact parsed values shown below it are the values submitted. Inline edits regenerate readable @ syntax. Existing quorum and OTP transactions remain intact.

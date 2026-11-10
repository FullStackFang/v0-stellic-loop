# Cohort trip experience

The home page now starts a cohort trip. Trip links use `/trip/<slug>`.
Existing `/b` spaces and `/p` plans keep their existing behavior.

## Available now

- Create or join a trip using the existing phone verification flow.
- Organizer sets a destination and optional start/end dates, without the old two-week restriction.
- Participants add arrivals, accommodation, and shared activities; join or leave each activity independently.
- Personal travel details and documents are private by default. Sharing makes them visible to anyone with the trip link.
- Upload/download original PDF, JPG, PNG, or text documents up to 3 MB. Files are stored in Postgres for this bounded MVP, using the existing server connection.
- Matching shared arrivals at the same entered airport/station and on the same date appear together as a transfer coordination prompt. This does not book transport or imply matching flight times.

## Deployment

Apply `supabase/migrations/20261104211739_cohort_trip.sql` to the target database before deploying the app. It adds `trip`, `trip_item`, and `trip_rsvp`, enables RLS, and denies public Data API access; the app's signed server session controls access. The migration was tested using the repository's local PGlite harness. It has not been applied to the hosted database as part of this change.

No paid or external integration was added. Existing phone verification still supports US numbers only.

## Boundaries

Uploads preserve the original document. They do not automatically extract an itinerary. Users add activities manually. Assistant Q&A, automated reminders, schedule-conflict detection, booking changes, and payments are not implemented in this pass.

Private file bytes and private item metadata are filtered on the server. Knowing a document ID does not grant download access. An owner can remove their own entries and files; another participant cannot.

## Verification

Run `npm test -- actions/__tests__/trip.test.ts components/__tests__/TripView.test.tsx actions/__tests__/boards.test.ts` for database authorization, validation, RSVP, phone verification, and UI interaction checks. Run TypeScript and targeted ESLint checks, then the production build once at the end.

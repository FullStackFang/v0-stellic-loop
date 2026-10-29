# Tasks

Cut line: usable by cohort 2 on **Oct 27 2026**. MVP = groups 1–5, 6.1–6.5, 7.3, 8.1–8.3. Deferred (specs kept, tasks marked) = 7.1, 7.2 (first after deploy), then 6.6, 6.7, 7.4, 8.4, 9.1.

Dependency order: 1 → 2 (2.4 before 2.2's verification) → 3 → {4, 6.1} in parallel → {5, 6.2–6.5, 7.3} in parallel → 9.2–9.3. Task 1.4 needs the organizer's Supabase and Resend accounts and runs before 3.2. Tasks 4.4 and 5.4 edit the same member page; run 5.4 after 4.4. Tests run against the `loop-test` project only.

## 1. Scaffold and infrastructure

- [x] 1.1 Create `web/` with Next.js 16 (App Router, TypeScript, Tailwind 4, ESLint), Vitest with jsdom and Testing Library, `@supabase/supabase-js`, `@supabase/ssr`, `resend`, `lucide-react`; verify `npm run build` and `npm test` pass on a smoke test
- [x] 1.2 Add `web/.env.example`, `web/vercel.json` with crons, stub cron routes checking the bearer secret, and `web/README.md`; verify the README commands run as written
- [x] 1.3 Port design tokens from the root demo's CSS into `web/app/globals.css` only; verify the home route renders with the tokens in light and dark
- [ ] 1.4 Organizer creates `loop-dev` and `loop-test` Supabase projects and verifies the Resend domain; set Supabase Auth custom SMTP to Resend on `loop-dev`, replace the magic-link email template with the `/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}` form, add `${NEXT_PUBLIC_APP_URL}/**` to Redirect URLs, enable the auth hook; add `SUPABASE_TEST_DB_URL` and `REMINDER_LINK_SECRET` to `.env.example` and README, add the `reminders` cron to `vercel.json` and its stub route; verify a magic link arrives in a real inbox within a minute, the confirm URL's `next=` value is percent-encoded (`%3F`, `%26`), and `npm run build` passes

## 2. Schema, policies, seed

- [ ] 2.1 Write migration `0001_schema.sql` with every table, enum, composite FK, nullable weekly slot plus `single_occurrence_at` with the exactly-one check, `membership.rsvp_source`, `loop_secret`, `drop`, `rsvp`, `reminder_send`, `digest_send`, the definer view `v_crew_members`, and the invoker views `v_intent_transitions`, `v_crew_stats`, `v_watch_conversion`, `v_drop_stats` from design.md; verify `supabase db reset --db-url $SUPABASE_TEST_DB_URL` then `db push` applies cleanly and `supabase db diff` against `loop-test` is empty
- [ ] 2.2 Write migration `0002_policies.sql`: RLS on every table, no `anon` grants, zero write policies for `authenticated`, member SELECT policies (own person, own membership rows, member-or-organizer loops and their occurrences), organizer SELECT policies on `organizer_id = auth.uid()`; verify `web/supabase/tests/rls.test.sql` with three seeded users (member in A+B, member in A only, organizer) passes every `member-privacy` scenario including own-loop returns own row only, anon returns zero rows, member update of `crew_id` affects zero rows, member insert into `loop` affects zero rows, and `v_crew_members` returns no intent or drop column
- [ ] 2.3 Write migration `0003_auth.sql`: `person` insert trigger from `auth.users` resolving campus by exact domain, and the before-user-created hook function; document enabling the hook in the hosted dashboard; verify on `loop-test` that sign-up with `@cornell.edu` and `@med.cornell.edu` creates a person and `@gmail.com` is rejected
- [ ] 2.4 Write `web/supabase/seed.sql` (Cornell campus with the six listed domains, organizer, three test members, one loop meeting Thursdays 7pm with 4 occurrences, one one-off loop with a single occurrence, `loop_secret` rows, two drops); verify reset + push + seed on `loop-test` loads it and 2.2's tests run against it
- [ ] 2.5 Write `web/supabase/tests/stats.test.sql` fixtures for `v_crew_stats` (3-and-4-present → 7 of 8; latecomer; Out-and-absent counted; said-In-and-came 2 and 1; unmarked week excluded; cancelled excluded; left member's past attendance kept), `v_watch_conversion` (1 of 3 plus 1 pending), and `v_drop_stats` (5 via one drop, 2 no drop; single_drop vs mixed); verify they pass on `loop-test`

## 3. Identity and sign-in

- [x] 3.1 Implement server, browser, and admin Supabase clients (`lib/supabase/server.ts`, `client.ts`, `admin.ts`) and `proxy.ts` session refresh; verify a signed-in server component reads `auth.uid()`
- [x] 3.2 Build `/signin` (email form → `signInWithOtp` with `emailRedirectTo` to `/auth/confirm?next=…`), the `/auth/confirm` page with a "Continue" button that POSTs `verifyOtp({ type: 'email', token_hash })`, the expired/used error state with a resend form, mapping of the hook rejection to "a campus email is required", and `next` restricted to same-origin paths (relative, or absolute on the app origin) starting with `/l/` or `/org/`, with `emailRedirectTo` set to the destination itself; verify with `auth.admin.generateLink` that sign-in happens only after Continue, a second Continue shows the error state, and an external `next` is dropped
- [x] 3.3 Build the first-name gate: any member or organizer page redirects a Person without `first_name` to `/welcome`, which carries `next` through; verify a brand-new user who started at `/l/<slug>?intent=watching&d=<token>` ends on `/l/<slug>/me` with that intent and drop

## 4. Loop page and tap-in

- [x] 4.1 Build `/l/[slug]` tap-in page reading via the service-role client with explicit columns: facts (weekly slot or one-off date), linked URL, three intent radios defaulting to `crew_conditional` with the Luma/Partiful sub-line on the second, the optional "Already RSVPed somewhere?" dropdown, button text bound to the selection, `d` token carried into the form; verify by Testing Library that each selection changes the label and that the HTML contains no names, counts, or drop labels
- [ ] 4.2 Implement `tapIn` server action: signed-out path stores intent and drop in `next` and sends the link; signed-in path checks campus match, resolves the drop token (invalid → null), inserts membership with `tapped_in_at`, `drop_id` once, and `rsvp_source`, writes `intent_history` with the next occurrence id, and treats an existing membership as `setIntent` (updating `rsvp_source` if answered); verify integration tests on `loop-test` for first tap-in (null previous, drop set), re-tap with a different drop (previous recorded, `tapped_in_at` and `drop_id` unchanged), invalid token (no drop, no error), wrong campus (rejected)
- [x] 4.3 Implement `setIntent`, `leaveLoop`, and `rejoin` server actions; verify a change writes a history row with the previous value and leaves `crew_id` untouched; leaving sets `left_at` and keeps `crew_id`; rejoin clears `crew_id`, `crewed_at`, `left_at` and keeps `drop_id`
- [x] 4.4 Build the member page `/l/[slug]/me` waiting state: facts, own intent control (focused when `?focus=intent`), leave control, redirect to `/l/[slug]` for non-members; verify the HTML for a waiting member contains no other first names, no counts, and no RSVP controls

## 5. Crew formation, RSVP, member page

- [x] 5.1 Implement pure `lib/formation.ts` (eligibility, pool order, step 1 fill oldest crews to 5 active, step 2 even packing with round-robin, anchored flag, input-snapshot hash); verify Vitest asserts the exact numeric outcome of every `crew-formation` scenario including crew-of-4 absorbs one of three, 7 → one crew of 6, 9 → 5+4, 13 → 5+4+4, six committed → one crew, and repeat run is a no-op
- [ ] 5.2 Write Postgres function `apply_formation(loop_id, placements jsonb, input_hash)` recomputing the input hash from current rows, aborting on mismatch, creating crews and setting `crew_id`, `crewed_at`, `anchored` in one transaction; verify a mismatched hash and a forced mid-call error both leave zero new crews
- [x] 5.3 Build the placement email HTML template and the organizer "Form crews" preview → confirm flow calling 5.1 then 5.2, then sending one placement email per newly placed member through the Resend client (stubbed under test); verify confirm creates crews, a tap-in between preview and confirm aborts with a fresh preview, and the stub recorded one send per placed member
- [x] 5.4 Implement `setRsvp` server action (crewed, active, occurrence not ended or cancelled) and extend the member page with the crewed state: crew list from `v_crew_members` with "(you)" and this week's In / Out / No reply, "I'm in" and "Can't this week" controls; verify the rendered HTML contains no email, no intent value in the crew list region, no drop data, and that an uncrewed member's RSVP is refused

## 6. Occurrences, attendance, dashboard

- [x] 6.1 Implement `lib/occurrences.ts` (next N weekly starts from local wall time in the campus zone, next-occurrence rule) and `/api/cron/occurrences` (weekly loops only; one-off loops skipped); verify Vitest for the Oct 29 → Nov 5 2026 boundary keeping 7pm local, the during-the-meeting rule, that running the cron twice tops up to 4 future rows then adds nothing, and that a one-off loop never gains a row
- [x] 6.2 Build `/org/new` gated by `ORGANIZER_EMAILS` (title, weekly slot or one-off date-time, duration, place, slug, default URL; slug-taken error; one-off creates exactly one occurrence) and `/org/[slug]` dashboard shell with members-by-intent groups (first name, email, tap-in, drop label, RSVP source, crew), waiting count, taps-in by drop and by RSVP source, loop settings (place and default URL editable, slot read-only, drops add/copy), and remove-member; verify a non-allowlisted user gets the not-found page at `/org/new` and a non-organizer gets it at the dashboard (UI-level: with streaming the status stays 200 plus `noindex`, and no loop data renders), and the organizer sees three groups with counts and the drop counts
- [x] 6.3 Build the occurrence list with per-occurrence URL field, Partiful note, this week's In count, and cancel for future occurrences; verify cancelling marks the row and the member page's next occurrence skips it
- [x] 6.4 Build the attendance grid (crew members × started non-cancelled occurrences, markable only between their `crewed_at` and `left_at`, cycling none → present → absent → none via server action, disabled for future, RSVP shown in each cell); verify two taps persist "absent" across reload
- [ ] 6.5 Build the crew list with this week's RSVP per member, anchored, single-drop/mixed, reached-third, show-up rate, and said-In-and-came from `v_crew_stats`; verify against the 2.5 fixture that the seeded crew row shows 7 of 8 and 2 → 1
- [ ] 6.6 (deferred) Build the metrics panel (transition pairs, anchored vs not, single-drop vs mixed, third-meeting count, pooled show-up, said-In-and-came, taps by drop, conversion with pending); verify the 2.5 fixture produces the expected numbers on screen
- [ ] 6.7 (deferred) Build CSV export routes (`memberships.csv`, `events.csv`) with a tested CSV writer; verify row count equals memberships and a non-organizer gets 404

## 7. Linked events and calendar

- [ ] 7.1 (deferred, first task after deploy) Implement `lib/preview.ts`: URL validation (http/https, resolved address not loopback/private/link-local, also on each redirect), fetch limits (8 s, 3 redirects, 1 MB), parser for `og:*` plus JSON-LD Event; verify Vitest fixtures for a Luma page, a bare page, a `javascript:` URL, and a private-address host
- [ ] 7.2 (deferred, first task after deploy) Wire preview fetch on loop and occurrence URL save and on "Refresh preview", keeping the old cache on failure; verify a simulated timeout leaves the previous row intact
- [x] 7.3 Render the effective URL (occurrence override, else loop default) as a plain link on the tap-in page, member page, and emails, with the cached preview when a `link_preview` row exists; verify no network call happens during a page request (fetch mocked to throw) and the override URL wins for the next occurrence
- [ ] 7.4 (deferred) Implement `lib/ics.ts` and routes `/api/ics/[token]/loop.ics` and `/api/ics/[token]/[occurrenceId].ics` reading `loop_secret` via the service role; verify Vitest parses both outputs with `ical.js` and no output contains an email or first name

## 8. Reminders and digest

- [x] 8.1 Implement `lib/signedLink.ts` (HMAC token: membership, occurrence, status, 48 h expiry) and `/r/[token]` handler (GET verifies and returns an auto-submitting form with a visible button; POST writes `rsvp` for exactly that pair) that redirects to the member page with `?marked=`, which shows "Marked you as In for Thursday" with an undo that flips the RSVP, showing "link expired" on bad or old tokens; verify Vitest for sign/verify/expiry/tamper, that GET writes zero rows and POST writes one, and that the proxy never runs on `/r/*` so no session cookie is set
- [x] 8.2 Build the reminder HTML template and `/api/cron/reminders`: for each crewed active member whose next non-cancelled occurrence starts 12–36 h out (half-open, daily 14:00 UTC), one email with crew first names, time, place, link, current In count, In/Out signed links, loop footer; `reminder_send` row per send, skip existing; verify a run on the fixture sends one per crewed member for an occurrence 33 h out, zero at 10 h and 36 h, zero for cancelled occurrences, and a second run sends zero
- [x] 8.3 Build `/l/[slug]/leave` (signed-in confirm page used by email footers) and add the footer to the placement and reminder templates; verify every sent email body contains the footer and leaving from it sets `left_at`
- [ ] 8.4 (deferred) Build the digest HTML template and `/api/cron/watching-digest` with `digest_send` idempotency and uncrewed logging; verify one send per watching member, zero for loops with none, second run sends zero

## 9. Integration and deploy

- [ ] 9.1 (deferred) Playwright smoke test: sign in via `auth.admin.generateLink` and the confirm page → tap in conditional → organizer forms crews → member page shows first names → RSVP In; verify it passes against a preview deployment
- [ ] 9.2 Create the Vercel project with root `web/`, set env vars for `loop-dev`, deploy a preview, hand-run the smoke path above; verify the preview URL serves `/l/<seed-slug>`, a hosted magic link arrives via Resend, and a reminder lands in a real inbox from a manual cron call
- [ ] 9.3 Update `web/README.md` with the organizer runbook (create loop, add drops, paste link, form crews, cancel a week, mark attendance, read stats via SQL) and update root `SPEC.md` status line to point at `web/`; verify a fresh reader can follow the runbook

## Workflow follow-up

- Fable reviewer signs off each task group before the next depends on it.
- Archive the change after the Oct 27 deploy; deferred tasks move to a follow-on change.

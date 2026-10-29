# Design

## Context

See proposal.md for motivation. Constraints that shape the approach:

- Nothing from the root demo is reusable as code: it is a single `index.html` with in-browser JSX and a localStorage blob. Its design tokens, copy, and card patterns are reused as reference only.
- One builder plus parallel subagents. The app must be usable by cohort 2 on **Oct 27 2026**; the Nov 13 write-up depends on its data. Cohort 1 runs as a group chat and does not depend on the app.
- The pilot needs measurements, not features: every table exists to answer intent transitions, anchored vs unanchored, third meeting, show-up rate, watching conversion, and drop attribution.
- Privacy rules from `member-privacy` must hold in the database, which means row-level security plus a strict rule about which client reads and writes what.
- The Next.js App Router reserves the `app/` folder name for routes, so the project lives in `web/`.
- No Docker. Development and tests run against hosted Supabase projects.

## Goals / Non-Goals

**Goals:**
- A deployed app at a stable URL that one organizer and their members can use on Oct 27.
- Deterministic, unit-tested crew formation, implemented once in TypeScript.
- Every privacy rule enforced by database policies that a SQL test exercises with three users.
- Idempotent cron jobs (occurrence top-up, day-before reminder; weekly digest deferred).

**Non-Goals:**
- Any Luma API work, including stubs or feature flags for it. The `linked_url` columns are the full extent of event integration.
- Automatic crew formation or matching heuristics beyond the stated packing rule.
- Multi-organizer loops, roles beyond the organizer allowlist, or campus-admin screens.
- Phone numbers anywhere in the schema.
- A styleguide page, a component library, or React Email. Tokens go in `globals.css`; emails are HTML strings.
- Before the Oct 27 deploy: the metrics panel, CSV routes, watching digest, preview fetching, `.ics`, and Playwright. Their specs stay; the tasks are marked deferred. Preview fetching (7.1–7.2) is the first task after deploy, ahead of the metrics panel, because once a club attaches a Luma or Partiful page to a one-off loop the preview is most of what "alongside" looks like to a student.

## Decisions

**Stack: Next.js 16 App Router + TypeScript + Tailwind 4, in `web/`, deployed to Vercel.**
Matches the other `v0-*` apps and the Vercel setup already linked to this repo. Alternative: static front end plus serverless functions. Rejected because auth, server rendering, and cron come free with Next on Vercel.

**Database and auth: Supabase (Postgres + Auth magic link), Resend as Supabase custom SMTP and for app email.**
Supabase gives RLS, magic links, and hosted Postgres with no infrastructure. The built-in Supabase mailer is limited to a few emails per hour, so Resend is wired as custom SMTP before any auth testing (task 1.4, which needs the organizer's accounts and DNS, so it runs first). Alternatives: Neon plus hand-rolled magic links (we would own token issuance and sessions); Clerk (campus gating and Person-by-email are simpler in a Supabase auth hook).

**Hosted Supabase for everything; a second project for tests.** Two hosted projects: `loop-dev` (development, seeded, later promoted to production) and `loop-test` (RLS and stats SQL tests, reset before every run with `supabase db reset --db-url $SUPABASE_TEST_DB_URL`). Tests never run against the seed project. Migrations apply with `supabase db push`. Sign-in in tests uses `auth.admin.generateLink` and the confirm page; sign-in in development uses a real inbox through Resend.

**Data access rule (the privacy core).** Three clients, each with a fixed job:
1. `anon` has no grants on any table or view. Public pages (`/l/[slug]`) and `.ics` routes read on the server with the service-role client using explicit column lists (title, slot, place, linked URL, cached preview), never `select('*')`.
2. `authenticated` reads through RLS. Members may SELECT only their own `person` row, their own `membership` rows, `loop` rows they are a member or organizer of, and `occurrence` rows of those loops. Crewmates are exposed only through `v_crew_members(crew_id, membership_id, first_name, is_you, rsvp_status)`, a definer view (owner `postgres`, `security_invoker = false`, `GRANT SELECT TO authenticated`) whose body filters `crew_id IN (select crew_id from membership where person_id = auth.uid() and left_at is null)`, joins only rows with `left_at is null`, and reports `rsvp_status` for the loop's next occurrence only. No `intent` column of another person is ever selectable by a member.
3. Organizer reads of their own loops go through RLS policies keyed on `loop.organizer_id = auth.uid()` for `membership`, `intent_history`, `occurrence`, `crew`, `attendance`, `rsvp`, `drop`. Members' `person` rows (first name, email) for the dashboard are read on the server with the service-role client after the organizer check.
4. The metric views (`v_intent_transitions`, `v_crew_stats`, `v_watch_conversion`, `v_drop_stats`) are `with (security_invoker = true)` so the organizer policies apply; `rls.test.sql` covers every view with three users (member in A and B, member in A only, organizer).
5. The service-role client is used only in server code for: public page reads, organizer person reads, cron jobs, `apply_formation`, preview fetch, email sends, signed-link handlers, and `.ics` routes. It never reaches the browser.
6. `ics_token` lives in its own table `loop_secret(loop_id, ics_token)` with no `authenticated` policy, so it cannot leak through a loop select.
7. `authenticated` has no INSERT, UPDATE, or DELETE policy on any table. Every write is a server action that checks the session (and organizer ownership where relevant) and then writes with the service-role client, or a `security definer` function. `rls.test.sql` asserts that a member's UPDATE of `membership.crew_id` and INSERT into `loop` affect zero rows. This rule ships in the policies migration, not later.

**Schema** (all ids `uuid`, timestamps `timestamptz`):
- `campus(id, name, tz, domains text[])`
- `person(id = auth.users.id, campus_id, email, first_name, created_at)`
- `loop(id, campus_id, organizer_id, slug unique, title, weekday int null, start_local time null, single_occurrence_at timestamptz null, duration_min, place, linked_url, created_at)` with `check ((weekday is not null and start_local is not null and single_occurrence_at is null) or (weekday is null and start_local is null and single_occurrence_at is not null))`
- `loop_secret(loop_id pk, ics_token unique)`
- `drop(id, loop_id, token unique, label, kind enum group_chat|pin|person|event_page|qr, created_at)`
- `membership(id, loop_id, person_id, intent enum, tapped_in_at, crewed_at null, crew_id null, left_at null, drop_id null, rsvp_source enum null (luma|partiful|campusgroups|other|none), unique(loop_id, person_id), fk (crew_id, loop_id) → crew(id, loop_id))`
- `intent_history(id, membership_id, prev_intent null, new_intent, occurrence_id null, changed_at)`
- `occurrence(id, loop_id, starts_at, linked_url null, cancelled bool default false, unique(loop_id, starts_at))`
- `crew(id, loop_id, formed_at, anchored bool, unique(id, loop_id))`
- `rsvp(occurrence_id, membership_id, status enum in|out|no_reply, responded_at, pk (occurrence_id, membership_id))`
- `attendance(id, occurrence_id, membership_id, status enum present|absent, marked_at, unique(occurrence_id, membership_id))`
- `link_preview(url pk, title, image_url, description, event_start, event_location, fetched_at, last_error)`
- `reminder_send(membership_id, occurrence_id, sent_at, pk (membership_id, occurrence_id))`
- `digest_send(membership_id, week_start date, sent_at, pk (membership_id, week_start))`
- Views: `v_crew_members` (definer), `v_intent_transitions`, `v_crew_stats` (anchored, single_drop, met_count, reached_third, present, denominator, said_in, said_in_and_came), `v_watch_conversion` (converted, eligible, pending), `v_drop_stats` (taps per drop).

Crew membership is `membership.crew_id` with the composite foreign key so a membership can never point at another loop's crew. `crewed_at` starts the attendance denominator. `left_at` marks leaving and keeps `crew_id` so past attendance stays attributed: `v_crew_members`, formation's crew-size count, reminders, and the digest require `left_at is null`; the show-up denominator requires `occurrence.starts_at < left_at` when set. An occurrence counts for a crew only when a member inside their crew window has a mark for it. Reactivation after leaving clears `crew_id`, `crewed_at`, and `left_at`. `drop_id` is written on first tap-in only and never changed. `rsvp_source` is self-reported on the tap-in page ("Already RSVPed somewhere?"), may be updated on re-tap-in, and is readable only by the organizer, like `drop_id`.

**Intent is the standing state; RSVP is per occurrence.** Intent never means "not this week". A crewed member answers In or Out for the next occurrence; absent an answer the status is `no_reply`. Crewmates see this week's RSVP status by first name; they never see intent. Show-up has no intent carve-out.

**Campus gating.** A Postgres function `auth_hook_before_user_created` rejects emails whose exact domain is on no campus's `domains`. The function lives in a migration; enabling it is project configuration (Auth Hooks in the hosted dashboard), and the client maps the resulting `signInWithOtp` error to "a campus email is required". A trigger on `auth.users` inserts `person` with the campus resolved from the domain. The Cornell seed lists `cornell.edu`, `med.cornell.edu`, `tech.cornell.edu`, `johnson.cornell.edu`, `law.cornell.edu`, `vet.cornell.edu`; exact match only, editable in `seed.sql`. Tap-in additionally checks `person.campus_id = loop.campus_id`.

**Sign-in link lands on a confirm page.** Supabase's default magic-link template points at `/auth/v1/verify`, which consumes the token on GET, so the template is replaced in the hosted Auth templates with `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`. The page renders a "Continue" button; a POST calls `verifyOtp({ type: 'email', token_hash })`. This survives mail scanners that prefetch links. `emailRedirectTo` is the destination itself (`${NEXT_PUBLIC_APP_URL}` + the sanitized `next`), so `{{ .RedirectTo }}` arrives at the confirm page as an absolute URL; this requires `${NEXT_PUBLIC_APP_URL}/**` in the project's Redirect URLs allow list. `safeNext` accepts a relative path or an absolute URL on the app's own origin and reduces it to `pathname + search`, which must start with `/l/` or `/org/` with no dot segments or backslashes; anything else becomes `/`. `next` carries the loop slug, chosen intent, and drop token so a signed-out tap-in completes on return, and `/welcome` passes it through.

**Signed one-tap links in reminders.** The reminder's In and Out links carry an HMAC-signed token (`membership_id`, `occurrence_id`, `status`, `exp` 48 h) verified server-side with `REMINDER_LINK_SECRET`. The handler writes `rsvp` for exactly that pair and then redirects to the member page with `?marked=in|out`, which requires sign-in and shows "Marked you as In for Thursday" with an undo that flips the same RSVP, so an accidental or forwarded tap is visible and reversible. The handler never creates a session and never reveals anything on failure beyond "link expired".

**Crew formation is a pure function, implemented once.** `lib/formation.ts` takes `(eligibleMemberships, existingCrews)` and returns `{ fills, newCrews, waiting, inputHash }`, where `inputHash` hashes the input snapshot (eligible membership ids with intent and `tapped_in_at`, existing crew ids with active sizes). Step 1 fills existing crews to at most 5 active members; step 2 forms new crews of 4 to 6. The organizer action runs it for the preview; `apply_formation(loop_id, placements jsonb, input_hash)` is a Postgres function that recomputes only the input hash from current rows inside one transaction, aborts if it differs, otherwise applies the given placements: creates crews, sets `crew_id` and `crewed_at`, and sets `anchored` where any placed member's intent is `going_want_crew`. The packing algorithm exists only in TypeScript.

**Occurrences are materialized rows.** For a weekly loop each is computed from the slot's local wall time in the campus zone (not by adding 7 × 24 h), so the DST change on Sunday Nov 1 2026 keeps 7pm at 7pm. `unique(loop_id, starts_at)` makes top-up idempotent. Fixed-UTC cron hours drift one local hour after Nov 1; accepted.

**One-off loops.** A loop with `single_occurrence_at` instead of a weekly slot gets exactly one occurrence at creation; the top-up cron skips it; the recurring `.ics` feed returns not found for it while the single-occurrence file works. Crews, RSVP, reminder, attendance, and linked URL behave identically. The kickoff and the club-fair follow-through are one-offs with a Luma or Partiful page.

**Preview fetch (deferred)** runs server-side with hard limits (http/https only, 8 s, 3 redirects, 1 MB) and a resolver check rejecting loopback, private, and link-local addresses for the URL and every redirect target. Parses `og:*` meta tags and `application/ld+json` for an `Event`. Cached by URL. Triggered on save and by "Refresh preview". No refresh cron. Until it ships, pages and emails show the effective URL as a plain link.

**`.ics` writer (deferred)** is hand-written RFC 5545: the per-loop feed embeds a static `VTIMEZONE` for the campus zone and `EXDATE` lines for cancelled occurrences; single-occurrence files use UTC `DTSTART`. Routes keyed by `ics_token`.

**Cron via Vercel Cron**, routes under `app/api/cron/*` verifying `Authorization: Bearer $CRON_SECRET`: `occurrences` (daily, weekly loops only), `reminders` (daily, 14:00 UTC, window 12 h ≤ start − now < 36 h; a 24 h-wide half-open window is what lets a once-daily run see every occurrence exactly once, and 14:00 UTC puts the email on the previous morning in Eastern time for meetings before 10 pm EDT / 9 pm EST; later meetings are reached the same morning and the email says "Tonight"; the route floors `now` to the UTC hour so a late cron fire cannot open a gap between windows). One-tap RSVP links never write on GET: `/r/<token>` GET verifies and returns an auto-submitting form, POST writes, so mail scanners that prefetch every link record nothing; the session-refresh proxy skips `/r/*`, and `watching-digest` (weekly, Monday 14:00 UTC, deferred). Reminders record `reminder_send` rows and skip existing ones. The digest records `digest_send` keyed by `week_start` = the Monday of the current ISO week in UTC at run time.

**Emails via Resend** as HTML string templates: placement notice, day-before reminder, and (deferred) watching digest from the app; the sign-in link through Supabase SMTP. Every app-sent email names the loop and organizer, links the loop URL, and includes a leave link (`/l/[slug]/leave`, which requires sign-in and confirms). The sign-in email predates any membership and carries no loop footer. Under test the Resend client is replaced by an in-memory stub that records sends.

**Drops.** A drop is a labeled share link the organizer creates in settings: `/l/[slug]?d=<token>`. The token is unguessable and carries no personal data. On first tap-in the server resolves the token to `membership.drop_id`; later tap-ins and intent changes never change it. The public page renders identically with or without `d`. A crew is `single_drop` when every member's `drop_id` is the same non-null value, else `mixed`. Attribution is readable only by the organizer.

**Organizer allowlist** is `ORGANIZER_EMAILS` (comma-separated) checked server-side at `/org/new`. Ownership of existing loops is by `organizer_id` regardless of the allowlist.

**Testing.** Vitest for `formation.ts` (every crew-formation scenario, numerically), occurrence generation across Nov 1 2026, the signed-link signer, the CSV writer (deferred), the ics writer and preview parser (deferred). SQL tests under `web/supabase/tests/` against `loop-test` for RLS (three users) and for `v_crew_stats`, `v_watch_conversion`, and `v_drop_stats` fixtures. Playwright smoke (deferred) for sign in → tap in → form crews → member page.

## Risks / Trade-offs

- [Resend DNS and Supabase SMTP not ready] → Task 1.4 runs first and is the only task that needs the organizer's accounts.
- [Organizer never presses "Form crews"] → Dashboard shows the waiting count prominently. No auto-formation, by spec.
- [RLS mistakes leak data] → Three-user SQL tests run before deploy; `anon` has zero grants and `authenticated` has zero write policies, so a policy gap cannot be reached without a session and cannot write.
- [Concurrent confirms] → `apply_formation` hash-checks the input snapshot inside the transaction.
- [Signed links forwarded] → A forwarded reminder lets the recipient set one RSVP for one occurrence and nothing else; 48 h expiry; no session created.
- [Oct 27] → Deferred list above; each task group lands its own tests; groups 4, 6.1, 7.3 can run in parallel after 3.

## Migration Plan

1. Organizer creates two Supabase projects (`loop-dev`, `loop-test`) and the Resend domain; sets env vars in Vercel and `web/.env.local`; enables the auth hook and the custom email template in `loop-dev`.
2. `supabase db push` applies migrations to `loop-dev`; `seed.sql` inserts the Cornell campus, organizer, and one test loop. Tests reset and push to `loop-test`.
3. Deploy `web/` as a new Vercel project with root directory `web/`; the root demo project keeps its URL.
4. Rollback: the demo project is untouched; the MVP project can be paused in Vercel.

## Open Questions

- Digest hour per campus: fixed Monday 14:00 UTC when the digest ships; parameterize if a second campus joins.
- Re-forming crews that shrink below 3 after repeated absences: not needed in the first weeks; addable without schema change.

# Proposal

## Why

Loop today is a single-file demo (`index.html`) with localStorage state, four hard-coded personas, no identity, no server, and no organizer surface. The Weekend 3 addendum asks for intent states, linked events, cross-loop identity, and instrumentation, none of which can exist without a real backend. Cohort 2 starts on Oct 27 2026 and the Nov 13 write-up depends on its data, so a deployed MVP that real students and one real organizer can use must exist by then, recording the measurements the pilot depends on (intent transitions, anchored vs unanchored crews, third meeting, show-up rate, drop attribution).

## What Changes

- New deployable web app in `web/` (Next.js App Router, Supabase Postgres + magic-link auth, Resend email, Vercel). The demo at the repo root stays untouched as a design reference.
- Verified identity: one Person per verified email, scoped to a Campus by email-domain allowlist; one Membership per person × loop.
- Tap-in page per loop with a required three-state intent (`crew_conditional`, `going_want_crew`, `watching`) and an `intent_history` row on every change. Intent is the standing state only. An optional self-reported RSVP source (Luma, Partiful, CampusGroups, other, none) is recorded for the organizer.
- Loops are weekly or one-off: a one-off loop has a single date-time and exactly one occurrence; everything else is identical.
- Per-occurrence RSVP for crewed members (In / Out / No reply), visible to crewmates for the current week only.
- Organizer-triggered crew formation: no crew forms from `watching`; a `going_want_crew` member anchors a crew; crews persist across occurrences and are flagged anchored or not and single-drop or mixed.
- Member page: time, place, linked event, crew members' first names with this week's RSVP, the viewer's own intent and RSVP controls. Never shows other members' intents.
- Occurrences generated from the loop's weekly slot; organizer marks attendance per occurrence.
- Day-before reminder email to crewed members with one-tap In / Out links.
- Drop attribution: organizer-created share links (`?d=<token>`) recorded on first tap-in; taps by drop on the dashboard.
- Organizer dashboard: members by intent, form crews, attendance grid, crews with flags, drops. Metrics panel and CSV export are specified but deferred until after the Oct 27 deploy.
- Linked event URL on the loop and optionally per occurrence. Cached Open Graph preview specified but deferred; until then the URL renders as a plain link. Partiful gets a visible "no guest sync" note.
- `.ics` per loop and per occurrence: specified, deferred.
- Weekly email to `watching` members: specified, deferred.
- Instrumentation: intent transitions, anchored vs not and single-drop vs mixed per crew, reached third meeting, show-up rate, "said In and came", `watching` → crew-eligible conversion within 14 days, taps by drop, memberships by RSVP source.
- Explicitly out of scope: Luma adapter (pull, push, webhook), Partiful beyond link + preview, phone verification, chat, feeds, profiles, payments, native apps, AI matching, institution dashboards.

## Capabilities

### New Capabilities
- `campus-identity`: verified-email sign-in, Person keyed by email, Campus with domain allowlist, Person scoped to one Campus.
- `loop-membership-intent`: per person × loop membership carrying a required three-state intent, intent history, leave and return.
- `occurrence-rsvp`: per-occurrence In / Out / No reply for crewed members, visible within the crew for the current week.
- `crew-formation`: organizer-triggered placement of eligible members into persistent crews, with the anchored-crew rule and size bounds.
- `crew-card`: the member page: facts, crew by first name with this week's RSVP, own intent and RSVP controls, leave.
- `attendance-tracking`: occurrences derived from the loop's weekly slot, organizer-marked attendance, derived "met", "third meeting", show-up, and "said In and came".
- `meeting-reminder`: day-before email to crewed members with signed one-tap In / Out links, sent once per member per occurrence.
- `drop-attribution`: organizer-created share links, first-tap-in attribution, single-drop vs mixed crews, organizer-only reporting.
- `organizer-dashboard`: organizer-only view of one loop's members, crews, attendance, drops, metrics, and CSV export.
- `linked-events`: plain event URL per loop and per occurrence with a cached, non-blocking preview.
- `calendar-export`: `.ics` feeds for the loop's recurring slot and single occurrences.
- `watching-digest`: weekly email to members whose intent is `watching`, with a plain link to their page.
- `member-privacy`: cross-loop invisibility, intent privacy, RSVP visibility bounded to the crew and the current week, organizer scoping, campus-level counts only, database-enforced reads and writes.

### Modified Capabilities
None. The existing specs (`audience-visibility`, `shared-world-state`, `world-persistence`, `persona-viewpoint`, `drop-and-unit-surface`, `pulse-*`, `design-system-foundation`) describe the root demo, which does not change.

## Impact

- New directory `web/` with its own `package.json`, Supabase migrations under `web/supabase/migrations/`, and Vercel config. Deployed as a second Vercel project with root directory `web/`.
- New external dependencies: Supabase (two hosted projects: dev and test), Resend (transactional email and Supabase custom SMTP), Vercel Cron.
- Root `index.html`, mockups, and strategy docs are unaffected.
- Requires the organizer to supply Supabase and Resend credentials as environment variables before first deploy.

# Loop MVP (`web/`)

The Loop MVP: a Next.js 16 App Router app (TypeScript, Tailwind 4) on hosted
Supabase (Postgres + magic-link auth) with Resend for email, deployed to Vercel.
Members tap in to a weekly loop, organizers form crews of 4-6, crewed members
RSVP per week, and Vercel Cron jobs keep occurrences topped up and send the
day-before reminder.

Spec and tasks live in `../openspec/changes/loop-mvp/`. The root `index.html`
is the old click-through demo and is not used by this app.

## Setup

There is no local database and no Docker. Development runs against the hosted
`loop-dev` Supabase project; tests run against a separate hosted `loop-test`
project that is reset before every run. Tests never touch `loop-dev`.

1. Create two Supabase projects (https://supabase.com/dashboard): `loop-dev`
   and `loop-test`. From each, note the Project URL, anon key, service_role
   key, and the direct database connection string.

2. Copy the env template and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` come from `loop-dev`. `SUPABASE_TEST_DB_URL` is
   the `loop-test` connection string. Put your own address in
   `ORGANIZER_EMAILS` so you can create loops.

3. Apply migrations and the seed to `loop-dev` with the Supabase CLI
   (https://supabase.com/docs/guides/cli):

   ```bash
   npx supabase link --project-ref <loop-dev ref>
   npx supabase db push
   psql "$SUPABASE_DEV_DB_URL" -f supabase/seed.sql
   ```

4. Set Resend as Supabase's custom SMTP on `loop-dev` so sign-in emails reach a
   real inbox: Authentication -> SMTP Settings -> Custom SMTP with host
   `smtp.resend.com`, port `465`, user `resend`, password = your Resend API
   key, and a sender on a domain verified in Resend. Put the same key in
   `RESEND_API_KEY` and the sender in `EMAIL_FROM`. Then replace the magic-link
   email template (Authentication -> Email Templates -> Magic Link) with a link
   to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`
   The link must be an `<a href="...">` so the template engine percent-encodes
   the `next` value (`%3F`, `%26`); pasted as plain text the drop token would
   be lost. Then enable the before-user-created auth hook (Authentication -> Hooks).
   Add `${NEXT_PUBLIC_APP_URL}/**` (e.g. `http://localhost:3000/**`) under
   Authentication -> URL Configuration -> Redirect URLs, because the sign-in
   action passes the final destination page as the redirect target.

5. Install and run:

   ```bash
   npm install
   npm run dev      # http://localhost:3000
   npm test         # Vitest, single run
   npm run test:db  # SQL tests: resets loop-test, pushes migrations, runs supabase/tests
   npm run lint     # ESLint
   npm run build    # production build, also type-checks
   ```

## Deploy (Vercel)

Create a Vercel project with root directory `web/` and set the same variables
as `.env.local` plus `CRON_SECRET`, `REMINDER_LINK_SECRET`, and
`NEXT_PUBLIC_APP_URL`. `loop-dev` is promoted to production for the pilot.

## Cron jobs

`vercel.json` schedules routes under `app/api/cron/*`. Vercel calls them with
`Authorization: Bearer $CRON_SECRET`; anything else gets a 401. To hit one
locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/occurrences
```

| Route                       | Schedule (UTC)          | Status   |
| --------------------------- | ----------------------- | -------- |
| `/api/cron/occurrences`     | daily 06:00             | MVP      |
| `/api/cron/reminders`       | daily 14:00 (10:00 ET)  | MVP      |
| `/api/cron/watching-digest` | Monday 14:00 (09:00 ET) | deferred |

## Organizer runbook

How to run one loop end to end. Labels in quotes are the exact ones on
screen. Every dashboard write is scoped to the loop you organize; links never
write anything when merely opened.

### 1. Get on the allowlist and sign in

1. Your email must be in `ORGANIZER_EMAILS` (comma-separated, case does not
   matter) on the deployment. Without it, `/org/new` shows "not found".
2. Open `/org/new`. You are sent to the sign-in page. Enter your "Campus
   email" and press "Send sign-in link". The page says "Check your email".
3. Open the link on the same device. The "Almost in" page asks you to press
   "Continue". The first time, "What should we call you?" asks for your
   "First name"; press "Continue". Your first name is all members ever see.

### 2. Create a loop

On "New loop":

| Field | What to enter |
| --- | --- |
| "Title" | Up to 80 characters, e.g. `CS 2110 Thursday problem sets`. |
| "When" | "Weekly" (a "Weekday" and a "Start time") or "One date" (a "Date and time", in your campus time zone). |
| "Duration (minutes)" | 15 to 480, steps of 5. Default 90. |
| "Place" | Up to 120 characters. Editable later. |
| "Link" | The slug after `/l/`. Lower-case letters, digits, and single hyphens, up to 48 characters; `new` is reserved. This is the public link you share. |
| "Event link (optional)" | The Luma, Partiful, or CampusGroups page. Must start with `http://` or `https://`. Editable later. |

Press "Create loop". A weekly loop gets its next 4 occurrences at once and the
daily cron keeps 4 ahead; a one-off gets exactly one, which must be in the
future. The weekday and time cannot change after creation; place and link can.

"that link is taken" means another loop owns that slug. Pick another one;
nothing was created.

On success you land on the dashboard `/org/<slug>` with "Your loop is live.
Share the link below." The "Public link" is `/l/<slug>`; press "Copy" next to it.

### 3. Add drops

A drop is a labeled copy of the public link, so you can see which channel
people came through. On the dashboard, under "Settings" then "Drops":

1. Type a "New drop" label (up to 60 characters, e.g. `Donlon 2F GroupMe`).
2. Pick a "Kind": "Group chat", "Pin", "Person", "Event page", or "QR code".
3. Press "Add drop". The line "Added." shows the URL with a "Copy" button.
   Every drop stays listed with its label, kind, URL, and "Copy".

The URL is `/l/<slug>?d=<token>`. Paste one per channel: the GroupMe pin, the
Instagram bio, the QR code on the flyer, a friend who re-shares. The token is
random and carries no personal data.

Attribution sticks only on a person's first tap-in: the membership records
that drop once and never changes it, not on re-tap, intent change, leave, or
return. An unknown token tap-in just records "no drop". So if you re-pin a
new drop in an old chat, only newcomers show up under it. "Taps-in by drop"
on the dashboard counts memberships per drop plus "no drop".

### 4. Paste the Luma or Partiful link

- Loop default: "Settings", "Default event link (optional)", then "Save
  settings" ("Saved."). Also set at creation as "Event link (optional)".
- One week only: in "Occurrences", each upcoming row has a link field whose
  placeholder is the loop default. Type a URL and press "Save". "Leave a link
  empty to use the loop's default link that week." Rows that started or were
  cancelled have no field.
- A `partiful.com` URL shows "Partiful: link and preview only, guest sync not
  available" under the field. Nothing syncs from Luma or Partiful either; the
  link is a pointer, and members still tap in here.
- Previews (title, image) are deferred, so members and emails see the link as
  plain text (host and path) under "Event". Pages never fetch the URL.

### 5. Form crews

Crews never form on their own. Eligible = intent "In if there's a crew" or
"Going anyway", still in the loop, not yet in a crew. The "Members by intent"
section shows "N waiting for a crew".

1. In the "Form crews" section ("N eligible and not yet in a crew"), press
   "Form crews". Nothing is saved yet.
2. Read the preview: "Joining existing crews", "New crews" (count and sizes),
   "Still waiting", then each "New crew of N" or "Existing crew, now N" with
   first names; "(joining)" marks who is new to an existing crew. Rules:
   existing crews under 5 fill first (oldest crew first), then new crews of 4
   to 6, as even as possible; fewer than 4 left over wait. "Nobody to place
   right now." with "a new crew needs at least 4" means wait for more tap-ins.
3. Press "Confirm" to save and email, or "Cancel" to drop the preview.
4. "The pool changed since the preview. Here's the fresh one." means someone
   tapped in, left, or changed intent between your two presses. Nothing was
   saved; read the new preview and press "Confirm" again. "Crews are already
   formed." means a second "Confirm" found nothing left to place.
5. The result reads "Crews formed. Placed N members, emailed N." Each newly
   placed member gets one email, subject "You're in a crew for <title>", with
   "Your crew:" first names, "Next meeting:", "Meets:" (weekly only), "Where:",
   "Event:" if a link is set, and a "See your crew" button. Waiting members get
   nothing.
6. If it adds "N emails didn't send; their placements stand. Tell them in
   person: <names>", those people are in a crew but were not told. Message
   them yourself; their member page already shows the crew.

A crew is "anchored" when it holds someone who said "Going anyway" when
placed. Run "Form crews" again whenever "waiting for a crew" is 4 or more, or
an existing crew is under 5; placed members never move.

### 6. Cancel a week

In "Occurrences", only upcoming, not-yet-cancelled rows show "Cancel". Confirm
"Cancel the <date> meeting? Members will see the next one instead." The row is
struck through and marked "Cancelled". A started meeting cannot be cancelled
("That meeting has already started, so it can't be cancelled.").

Effects: members' next meeting skips to the following week, no reminder goes
out for it, RSVPs for it are refused, it gets no attendance column, and no
statistic counts it. There is no undo in the UI.

### 7. Mark attendance

The "Attendance" section is a grid of crew members (grouped by "crew
<id>") against meetings that have started and are not cancelled. The next
upcoming meeting is the last column, "(not started)", RSVP only.

- Who gets a row: active crew members, plus members who left but already have
  marks ("(left)"). Uncrewed members never appear.
- Each cell shows the RSVP ("In", "Out", or "—") above the mark ("·" unmarked,
  "Present", "Absent"). Tap to cycle unmarked, present, absent, unmarked. It
  saves on tap; "!" means it did not save, tap again.
- A cell is RSVP-only (no button) when the meeting is outside that member's
  time in the crew: before they were placed or after they left. Those pairs
  are not in any denominator.
- The grid opens for a meeting at its start time. "No crew members yet." or
  "No meetings yet." are the empty states.

Only meetings with at least one mark for a crew count for that crew. Mark
everyone, present or absent, or mark nobody for a week you want ignored. The
"Crews" section then shows per crew "Show-up" (present of denominator and a
percent), "Said In → came", and the flags "anchored" or "not anchored",
"single drop" or "mixed", "3rd meeting ✓" or "met N×" (a crew met when 3 or
more were present).

### 8. Read stats via SQL

Open the Supabase dashboard for `loop-dev`, SQL Editor, and run these. The
editor runs as the database owner, so it is not filtered by RLS; scope every
query to your loop yourself.

Find your loop id by slug:

```sql
select id, title from public.loop where slug = '<your slug>';
```

Per-crew flags and show-up (`v_crew_stats`):

```sql
select crew_id, formed_at, anchored, single_drop, active_members,
       met_count, reached_third, present, denominator, said_in, said_in_and_came
from public.v_crew_stats
where loop_id = '<your loop id>'
order by formed_at;
```

- `present` of `denominator`: show-up. Pairs of (crew member, counted meeting)
  inside the member's crew window; `present` is how many were marked present.
- `said_in` and `said_in_and_came`: pairs that answered In, and how many of
  those were marked present.
- `anchored`: true once a "Going anyway" member was placed in it.
- `single_drop`: every active member came through the same drop; otherwise
  mixed (including anyone with no drop).
- `met_count` and `reached_third`: meetings with 3 or more present, and
  whether that is 3 or more.

Overall pooled show-up for the loop:

```sql
select sum(present) as present, sum(denominator) as denominator,
       round(100.0 * sum(present) / nullif(sum(denominator), 0)) as pct
from public.v_crew_stats
where loop_id = '<your loop id>';
```

Intent changes (`v_intent_transitions`); `prev_intent` null is the first tap-in:

```sql
select prev_intent, new_intent, transitions
from public.v_intent_transitions
where loop_id = '<your loop id>'
order by prev_intent nulls first, new_intent;
```

Watching conversion (`v_watch_conversion`):

```sql
select converted, eligible, pending
from public.v_watch_conversion
where loop_id = '<your loop id>';
```

- `converted` of `eligible`: entries into "Keep me in the loop" at least 14
  days old whose next intent change, within 14 days, went to "In if there's a
  crew" or "Going anyway".
- `pending`: entries younger than 14 days, not yet counted either way.

Taps by drop (`v_drop_stats`); the row with a null `label` is "no drop":

```sql
select label, kind, taps
from public.v_drop_stats
where loop_id = '<your loop id>'
order by taps desc;
```

Taps by RSVP source (`v_rsvp_source_stats`); null `rsvp_source` is unanswered:

```sql
select rsvp_source, count
from public.v_rsvp_source_stats
where loop_id = '<your loop id>'
order by count desc;
```

### 9. What members see

The public link opens the tap-in page: title, the weekly line, "Next", "Where",
and "Event" as a plain link. "Your intent" offers "In if there's a crew",
"Going anyway, add me to a crew", and "Keep me in the loop", plus an optional
"Already RSVPed somewhere?" dropdown (Luma, Partiful, CampusGroups, Other,
None) that only you ever see. Submitting sends them through the same sign-in
and first-name steps as you, then to their member page `/l/<slug>/me`. While
waiting it says "You're in the pool. Crews are set by the organizer before
each week." with their intent (press "Save" to change) and "Leave this loop".
Once crewed it lists "Your crew" by first name with each person's answer for
this week ("In", "Out", "No reply") and the buttons "I'm in" and "Can't this
week". The morning before each meeting (cron at 14:00 UTC, 10:00 ET), every
crewed member gets an email, subject "Tonight: <title> at <time>" or
"Tomorrow: ...", with the crew's names, when, where, the event link, "N people
are in so far. Are you coming?", and two one-tap buttons, "I'm in" and "Can't
make it", valid for 48 hours. Tapping one lands on the member page with
"Marked you as In for Thursday" and an "Undo". Every email ends with "Leave
this loop", a confirm page ("Leave loop" or "Stay"). Members never see drops,
other crews, RSVP sources, or anyone's email.

### 10. If something looks wrong

- Reminder did not arrive: the job runs once a day at 14:00 UTC and picks up
  meetings starting 12 to 36 hours later, so a 7 PM meeting is reminded the
  morning before. Only crewed, active members get one. Check for a row in
  `reminder_send` for that `membership_id` and `occurrence_id`: a row means it
  was sent (or claimed); no row after the run means the send failed and the
  next run retries while the meeting is still inside the window.
- Member cannot answer In or Out: they must be in a crew and still in the
  loop, and the meeting must be the next one, not cancelled and not ended.
  Emailed links also expire after 48 hours; the member page always works.
- "not found" on `/org/new`: your email is not in `ORGANIZER_EMAILS`, or you
  signed in with a different address. "not found" on `/org/<slug>`: the loop's
  `organizer_id` is not you (the allowlist does not grant access to others'
  loops), or the slug is wrong.
- A link scanner opened the email: nothing happens. The In/Out links and the
  leave link only read on open; the write happens on a second step that a
  scanner never takes.
- Attendance cell shows "!": the save failed; tap again. If it keeps failing,
  reload: the meeting may have been cancelled or the member removed.

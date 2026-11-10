# Loop: app overview

Loop helps a group turn a casual “we should do something” into a plan that actually happens. The broader idea is to make belonging through repeated time together: especially for students, a small recurring crew can matter more than a one-time match. The current app focuses on the first step—getting one real plan formed with minimal coordination.

## What we have built

- Anyone can start a named, link-based space for their group. Its planning window rolls over the next two weeks.
- A member can post an intent in plain language, then inspect and edit the activity, day, time, place, rhythm, and `@` preference pins before posting. Unspecified details stay open. The poster is the first “yes.”
- People open a shared plan link, verify their phone number, and tap **I’m in** or **Can’t make it**. The page shows real progress toward the space’s four-person threshold and forms the plan automatically when enough people join.
- The space groups plans into **Open**, **Formed**, and **Wrapped up**. **Your plans** shows what a member joined or posted. If a plan does not form, the poster can post it again with a fresh count.
- The recent Sun design gives each plan a time-of-day look, with optional weather when the space has a location. Plan links also have share images and formed plans offer a calendar file.

## Where it stands

This is a Next.js app backed by Postgres on Supabase. Phone sign-in uses SMS verification when Twilio Verify is configured. The latest intent composer and preference storage were implemented and verified locally; their database migration (`0009_intent_preferences.sql`) must be applied to the hosted database before those app changes are deployed.

Rhythm is currently a **preference**, not an automatic recurring event. Each follow-up plan needs a new post and its own count. The longer-term Loop vision—stable recurring crews and an early belonging signal for advisors—remains a product direction rather than a capability of this app today.

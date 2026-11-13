## Why

On November 12 the founder set the goal as three scenarios on shared pieces: a project team, a club, and a trip. The team version is built (`loop-team-layer`). A club needs two things the team layer lacks: events with a date that members can say they are interested in, and a way to ask the group a question and see who has answered. These are the first things a real club organizer will be asked to try, and to pay for.

## What Changes

- Give events a date, an end, a place, a link and a short note. Today an event is only a name used as a label.
- Let a member say "I'm interested" in an event and take it back. Members of the group see who is interested. Someone outside the group sees a count only, and only at five or more.
- Add asks: a question to the group with a deadline. Kinds: pick one, pick several, pick dates, or a short written answer. Each member answers once and may change the answer until the ask closes.
- Give every ask and every dated event a share link the organizer can send into the group's WhatsApp chat with one button. A signed-in member who opens it acts on one page.
- Show the person who asked, and the group's organizers, who has not answered yet, with a ready-made reminder to send to the chat. The reminder names nobody.
- Let an organizer turn the group's join link into one that admits a person as soon as they sign in, so a club of forty needs no forty approvals.
- Add connector tools so all of this works from a member's own assistant as well as the site: list events, say interested, add an event, ask, answer, read results. `whats_new` reports new events, new asks and asks about to close.
- Let organizers add events and close asks through their assistant. Until now organizer actions were site-only.
- Not in this change: reminders sent by Loop, email, WhatsApp messages from Loop, the in-chat card, member reach preferences (all in `loop-club-reach`); proposals from members that turn into events, calendar invites (`loop-trip`); payments; private notes and matching.

## Capabilities

### New Capabilities

- `group-events`: dated events under a group, interest in an event, who can see interest, and the tools and pages that show them.
- `group-asks`: asks, answers, closing, results, the share link, who has not answered, the reminder text, and the tools and pages for them.
- `open-join`: an organizer's choice to admit people who sign in from the group's join link without approving each one.

### Modified Capabilities

None of the capabilities in `openspec/specs/` change. The team-layer capabilities (`team-curation`, `team-tools`) live in the unarchived change `loop-team-layer`; this change adds to them and states each addition as a new requirement.

## Impact

Root Next.js application: `lib/emba/team-events.ts`, `lib/emba/team-read.ts`, `lib/emba/team-mcp.ts`, `lib/emba/team-format.ts`, new `lib/emba/team-asks.ts` and `lib/emba/team-interest.ts`, the `/groups` pages, and new `/a/[token]` and `/e/[token]` pages. One additive PostgreSQL migration, applied by hand on `supabase-loop`. No new sign-in scopes: reads use `plan:read`, writes use `group-memory:write`. No new dependency, no model call on Loop's side, no outbound messages. Relaxes two rules of `loop-team-layer` on purpose; design.md names them (D6, D7).

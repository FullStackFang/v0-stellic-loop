## Why

The third scenario the founder named on November 12 is a trip: twenty people going to Vietnam with a shared itinerary. Each person tells the group their flights and what they would like to do, their assistant suggests what others are planning, and when enough people want the same thing with a date and place, Loop sends a calendar invite. If details are missing, it starts a poll. A trip reuses events, interest, asks and reach from the two club changes and adds three things: travel details, ideas that members propose, and calendar invites.

This change is the furthest out and is provisional. It is written now so the earlier changes leave room for it. It must be revised after a club has run with a real organizer.

## What Changes

- Let a member tell the group their arrival and departure: day and time, place, and optionally a flight number and where they are staying. Members of the group see who arrives and leaves when.
- Let any member propose an idea for the group ("buy suits on Thursday"), with or without a time and place, and a number of people it needs. Other members say they are in. Today only owners and organizers can add events.
- When an idea has enough people, a time and a place, it becomes a plan: those who are in get a calendar invite.
- When an idea has enough people and is missing a time, Loop opens an ask among those who are in, to settle it. When it is missing a place, Loop asks the proposer to add one.
- Add a "what's on this day" read, so an assistant asked "what should I do Thursday?" can answer with the itinerary and with what others in the group are planning, by name.
- Give each member a calendar feed for a group that they can subscribe to in their own calendar, and send calendar invites for plans by email.
- **BREAKING for the team-layer posture:** Loop acts on a threshold. `loop-team-layer` stated that this slice forms nothing on its own.
- Not in this change: booking, payments, splitting costs, maps, importing flights from email, and moving the existing cohort trip board (`/b/emba27`) onto this model.

## Capabilities

### New Capabilities

- `trip-travel`: a member's stated arrival, departure and stay for a group, who can see them, and the arrivals read.
- `group-ideas`: ideas proposed by members, saying "I'm in", the number needed, turning into a plan, and what Loop does when a detail is missing.
- `calendar-invites`: calendar invites for plans, updates and cancellations, and the per-member calendar feed.

### Modified Capabilities

None of the capabilities in `openspec/specs/` change. The cohort board's `quorum-and-lock` capability is left as it is; design.md explains why this change does not build on it.

## Impact

Root Next.js application: `lib/emba/team-events.ts`, `lib/emba/team-interest.ts`, `lib/emba/team-asks.ts`, `lib/emba/team-mcp.ts`, new travel and calendar modules, the `/groups` pages, and a calendar feed route. One additive migration. Depends on `loop-club-events-and-asks` (events, interest, asks) and on email from `loop-club-reach` (invites). A calendar-file library may be added, with the founder's approval. No model call on Loop's side.

## Context

This change depends on both club changes. It assumes a group has dated events, interest, asks, answers, share links, per-member reach choices and email.

The repository already holds two older trip systems:

- The cohort board at `/b/emba27` (Quorum), live for the founder's EMBA cohort, with threshold proposals and the `quorum-and-lock` capability in `openspec/specs/`. It has its own tables, phone sign-in and page design.
- The frozen cohort platform (`emba_activity`, commitments, `plan_for_me`, the trip composer at `/trips/new`), which uses the prepare, approve, execute flow the founder removed on November 9.

Neither sits on the team layer's groups, grants and connector.

The founder prefers linking into a person's own calendar over building a calendar inside Loop.

## Goals / Non-Goals

**Goals:**

- A traveller can ask their assistant "who lands when I do?" and "what should I do Thursday?" and get answers that include other members by name.
- An idea that enough people want becomes a plan in their calendars without an organizer arranging it.
- Nothing about the trip requires an assistant: the site, links and the calendar feed are enough.

**Non-Goals:**

- Booking, payments or cost splitting.
- Reading flights from a member's email or calendar. Members state them.
- Maps or routing.
- Migrating the cohort board. It keeps running as it is.

## Decisions

### D1. A trip is a group, built on the team layer

A trip is an ordinary group: the brief holds the itinerary summary and key links, uploaded documents hold the full itinerary, dated events are the fixed programme. This change adds to that group; it adds no new kind of space.

Alternative considered: extend the cohort board, which already has thresholds and locking. Rejected for now: it has a separate identity system and no connector, so nothing a member's assistant could use. The useful idea, a proposal that locks when enough people are in, is carried over in D3. Whether the cohort board is later moved onto this model is an open question.

### D2. Travel details are a member's own statement

One travel entry per member per group: arrival day and time and place, departure day and time and place, and optionally a flight number and where they are staying. Only the member writes their own. Members and followers of the group can read all entries; nobody outside the group can. Team-layer rule 4 holds: this is what a member said, and Loop draws no conclusion from it about anyone.

The arrivals read lists entries in time order and, for the caller, marks others arriving at the same place within two hours either side. That grouping is arithmetic on stated times, and it is the main reason to share a flight.

### D3. An idea is an event a member proposes

An idea is a row in the events table in a new state, `idea`, with the member who proposed it and a number of people it needs (2 to 20, default 3, counting the proposer). It may have a time and a place or not. "I'm in" is the existing interest mark. Any member with the right to post may propose, up to 5 open ideas each.

It turns into a plan (`planned`) at the moment it has the number needed, a start time and a place. That moment is checked inside the write that adds the last person or the last detail, under the group's write lock, so two people joining at once cannot both trigger it. A plan stays a plan if someone later drops out; the proposer or an organizer can cancel it.

An idea with no activity that has not become a plan lapses 12 hours after its start time, or after 14 days when it has none.

### D4. When a detail is missing

When an idea reaches the number needed and has no start time, Loop opens one ask, in the proposer's name, to the members who are in: pick-dates over the days the proposer offered, or over the remaining days of the trip when none were offered. It closes in 48 hours or when everyone in has answered. The day with the most answers becomes the idea's day; on a tie the proposer chooses. The proposer then sets the time.

When it has no place, Loop does not poll for one. It tells the proposer the idea has enough people and needs a place. A free-text poll for a place does not converge.

Loop opens at most one such ask per idea. This is the only ask Loop creates on its own.

### D5. A plan produces calendar invites

When an idea becomes a plan, each member who is in receives a calendar invite by email, if their reach choice for the group allows email, and the plan appears in the group's calendar feed for everyone. A change of time or place sends an update for the same calendar entry; a cancellation sends a cancellation. A member who says they are in after it became a plan gets the invite then; a member who drops out gets a cancellation for themselves only.

The invite lists the plan, time and place and the group's name. It does not list the other people who are in; the site and the assistant do.

Organizer-created events can be sent as invites too, by the organizer's choice, to members who marked interest.

### D6. A calendar feed per member per group

Each member can get a private subscription address for a group's calendar: fixed events and plans. Subscribing in Google, Apple or Outlook calendar keeps it current. The address carries an unguessable token, can be replaced by the member, and stops working when they leave the group. It exposes event names, times and places only: no names of who is interested or in, and no travel details.

This is the link-out the founder asked for instead of a calendar inside Loop.

### D7. "What's on this day"

A read for one day in the group's timezone returns the fixed events, plans, and open ideas for that day, each with who is interested or in, and whether the caller is. It is what an assistant uses to answer "what should I do Thursday?". Loop returns the list; the assistant does the suggesting. Loop runs no model.

### D8. Caps and lifetime

Per group: 100 open ideas. Per member per group: 5 open ideas of their own, one travel entry. Idea text 120 characters, note 600, place 120. Travel entries and the feed address are deleted when the member leaves; their ideas lapse; plans they proposed pass to the group's organizers.

## How this is built

Same rules as the club changes: test first, a denial test for each rule, an independent review after the services and of the whole change, and one demo point per section on the live site.

## Risks / Trade-offs

- [An idea becomes a plan while people are still deciding] → The number needed is set by the proposer and shown on the idea; a plan can be cancelled; dropping out sends that person a cancellation.
- [Too many ideas, none reaching the number] → Per-member cap, lapse rules, and the day read shows ideas closest to their number first.
- [Calendar clients treat invites differently] → Test the invite, update and cancellation in Google, Apple and Outlook before shipping; the feed is the fallback.
- [The feed address leaks] → It shows names, times and places of events only, and the member can replace it.
- [Stated flights go stale] → The entry shows when it was last changed; Loop does not check flights.
- [Two trip systems in one repository] → The cohort board is left untouched and unlinked from this change; the open question below decides its future.

## Migration Plan

One additive migration: travel entries, the idea state, proposer and number needed on events, calendar entry sequence numbers, and feed tokens. Rollback is dropping the new tables and columns; fixed events are unaffected.

## Open Questions

- Should the cohort board at `/b/emba27` be moved onto this model after the pilot, or retired with the cohort trip?
- Is "most answers wins, proposer breaks ties" the right rule for the missing-day ask, or should it need everyone who is in?
- Should a plan need a minimum notice before its start time (for example two hours) before invites are sent?
- Should invites name who else is in? This design says no, to keep names out of email.
- Is a default of three people right for a group of twenty?

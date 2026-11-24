## Context

`knownTo` in `lib/campus/knows.ts` returns the people a person knows, each with one line saying how: "In <group>" or "Went out with you". Where both are true the group wins. Three things read it:

- `pickOuting` joins the outing holding the most known people.
- `inviteChoices` sorts by invited first, then by that line (so "In …" comes before "Went out …"), then by id.
- The ticket's `pull` in `lib/campus/screen.ts` adds `min(known people going, 2)`.

The founder's rule "ranking stays silent" (spec `campus-search`, "Silent ranking") stands: nothing may say why something is ranked where it is.

## Goals / Non-Goals

**Goals:**
- One number per pair of people: outings both checked in on.
- That number orders invite suggestions, the outing "I'm in" joins, the faces on a ticket, and adds pull.
- No visible change other than order.

**Non-Goals:**
- Showing the number, or any "on repeat" label.
- Weighing recent outings more than old ones. All outings count the same for now.
- Friend-of-friend signals.
- Changing who a person knows, or whose face they may see.

## Decisions

**D1. Count on read, store nothing.** A new `timesOut(q, personId)` in `lib/campus/knows.ts` returns `Map<personId, number>` from one query over `campus_outing_member` joined to itself, counting distinct outings where both have `checked_in_at`. The index `campus_outing_member_person` already covers it. Alternative: a stored pair table kept up to date on check-in. Rejected: a second source of truth for a number one query gives, and it would need a migration.

**D2. `knownTo` stays as it is.** Its map still decides who is known and the line shown. The count is read beside it, in the same `Promise.all` in `campusScreen`, and passed to the functions that order things. Alternative: change the map's value to an object. Rejected: every caller would change for no gain.

**D3. Scoring an outing for "I'm in".** Each known member of an outing scores `1 + times out with the person`. The outing with the highest total wins; a tie goes to the one with more known people, then the older outing. An invite and a plan's open outing still come first, as today.

**D4. Invite order.** Invited first (unchanged), then times out, most first, then the line, then id. Still at most four.

**D5. Pull.** Keep `min(known going, 2)` and add 1 when at least one of them has been out with the viewer two or more times. One point, so a regular lifts an event without burying rewards and "today".

**D6. Face order.** Known people going are listed most times out first, then as today.

## Risks / Trade-offs

- [A person with many outings makes the count query heavier] → It is one indexed self-join per page read; measure on the dev database with the largest account before landing.
- [Order changes with no explanation may surprise] → That is the founder's rule; the mockup shows the before and after.
- [All-time counting keeps old friends on top] → Accepted for now; recency is a later change if it shows up in use.

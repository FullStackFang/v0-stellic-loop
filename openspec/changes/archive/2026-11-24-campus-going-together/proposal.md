## Why

Loopd knows whether two people have checked in on an outing together, but not how many times. So the person someone goes out with every week is treated the same as a person they met once, and comes after anyone who merely shares a group with them. Counting the times gives "your people" a real meaning, and three later changes (venue record, assistant tools, browser extension) lean on it.

## What Changes

- Count, for any two people, the outings they both checked in on.
- "Invite people" lists the people a person has been out with most first. The line under each name stays as it is.
- "I'm in" on an event with several outings joins the one holding the people the person goes out with most, not simply the one with the most people they know.
- An event that people the person goes out with often are in for gets more pull, so it is more likely to be among their best.
- On a ticket, the faces of people going are in the same order: most times out first.
- Nothing new is shown: no count, no label, no reason. Mockup: `public/demo/mockups-six-adds.html`, section 1.

## Capabilities

### New Capabilities
- `going-together`: how many times two people have been out together, and the rule that the number orders things and is never shown.

### Modified Capabilities
- `outings`: "Saying you are in" picks the outing by times out together; "Inviting people" orders the four suggestions by times out together.
- `campus-search`: "Best for you with nothing typed" gives more pull to an event that people the viewer goes out with often are in.

## Impact

- `lib/campus/knows.ts` (the count), `lib/campus/outings.ts` (`pickOuting`, `inviteChoices`), `lib/campus/screen.ts` (pull and face order).
- Tests: `lib/__tests__/campus-outings.test.ts`, `lib/__tests__/campus-edges.test.ts`, `app/c/campus-screen.test.tsx`.
- No migration, no new page, no new wording.

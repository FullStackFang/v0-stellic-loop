## Why

Today a person's plan must come with a place and a day before anyone has said they want it, and only the poster can settle the time. That makes the poster the owner, and most people who just want company ("run the island") never post at all. The founder's MVP (2026-11-24, mockup `public/demo/mockups-intent-propose.html`, approved with one fix: proposals are silent) separates what people want from when and where it happens: say the intent, let people gather on it, and let anyone in it propose a time and place. Matching events from the feeds and Luma become proposals on their own, so an intent gets offers without anyone posting.

## What Changes

- **Intent.** A signed-in person posts a line of what they want to do ("Run around the island before class", optional @tags). It has no time, no place, no day and no shown owner. It appears at once on the campus, can be found by anyone (campus list, search, a share link), and anyone signed in can press "I'm in" on it.
- **Close intents first.** While typing, an existing intent on the campus that means the same thing (same word group) is offered with its count and "I'm in", so the same wish does not split into two empty intents. Nothing is merged automatically.
- **Propose.** Anyone in an intent can propose a day, a time and a place. All three are required (a known public place where places are required, as on Cornell Tech). A proposal is a plan on the map and in the list, tied to its intent. **A proposal never shows who made it** (founder: "it should be silent"), not on the card, the stamp, the email or the details.
- **The ask.** Each proposal asks everyone in the intent once: by email and as a card at the top of the campus page. "Going" or "Can't". The proposer counts as going. At 2 going the proposal is on ("It's on") and is an outing with the usual invite and check-in. Several proposals can stand on one intent at the same time. The intent stays after a proposal passes, for the next one.
- **Matched events propose themselves.** When a shown event from a feed (CampusGroups, Luma calendars) or a read event link (Luma, Posh, ...) has a known place, falls in the next 14 days, and its words match an intent on the same campus, it is added to that intent as a proposal marked with its source, and everyone in is asked the same way. At most one such proposal per intent per day. Events waiting for the admin's review are not matched until shown.
- **Posting a line with a time and a place** posts the intent and its first proposal at once.
- **BREAKING:** a plan can no longer be posted with a day and no time; "When works?" and the poster's Send are retired for new plans (plans already posted that way keep working until their day ends). Member plans no longer show "Posted by" and the poster's name, and their map stamp no longer carries the poster's animal.

## Capabilities

### New Capabilities
- `campus-intents`: posting an intent, finding it, I'm in and leaving, close intents offered while typing, proposing a time and place, the ask (email + card), Going / Can't, on at 2, several proposals, silence about who proposed, and matched events becoming proposals.

### Modified Capabilities
- `member-plans`: posting from the campus panel makes an intent (and a first proposal when the line has a time and a place); a plan always has a start time; the poster is no longer named; the limit counts proposals.
- `plan-time-settling`: retired for new plans; plans already posted with no time keep their "When works?" until their day ends.
- `outings`: "Going" on a proposal joins that proposal's one outing for its intent, not an outing picked by who you know; no "When works?" after joining.
- `campus-screen`: intents in the campus list and search, the intent card, the ask card on top, proposal stamps without a face.

## Impact

- Database (the founder runs the SQL): new tables `campus_intent`, `campus_intent_member`, `campus_intent_proposal` (intent ↔ listing, with its outing and whether it was matched), `campus_proposal_answer` (Can't), and an ask outbox.
- `lib/campus/plans.ts`, `lib/campus/line.ts`, `lib/campus/outings.ts`, `lib/campus/import.ts` (match after a read), `lib/campus/words.ts` / `tags.ts` (matching keys), `lib/campus/screen.ts`, `lib/campus/view.ts`, `app/c/actions.ts`, campus components (composer, screen), a new intent page for the share link, and the hourly cron for sending the ask emails through the existing Resend sender (`lib/email/resend.ts`).
- No new dependencies, no AI model.

## Why

A member of several groups has no single place to see what each group still needs from them. On 2026-11-18 an organizer had to message the founder on WhatsApp to ask whether a form was uploaded, and the founder's reply was "I just need some place aggregated". Loop already gathers this per member (open asks, events not answered), but only an assistant can read it; the site has no page for it. Loop also has no way to post a plain to-do for everyone ("Upload your W8/W9 by Nov 22") and see who has done it.

## What Changes

- **"On you" on the campus screen.** The product has two sides: the groups you are part of, and the open groups you find through search. For a signed-in viewer the campus screen gains the first side: one list across all the groups they belong to of what is on them, soonest first (layout A, picked by the founder 2026-11-18). Each row says the kind (Vote, Show up, Do), what it is, which group, and when.
- **Acting in the row.** A to-do is ticked done, a pick-one vote with few options is cast, and an event is answered from the row itself. The row then leaves the list. Asks that need more room (several options, dates, a written answer) open their existing page.
- **A to-do for everyone.** A new kind of ask, "something to do": no options, each member marks it done once, with a due time. It reuses everything asks already have: who has not done it (for the asker and organizers), the reminder, the share link, outbound messages, and the assistant tools and card.
- No chat, no files area, and no new notification channel. Messages stay as they are: only from a member's groups.

## Capabilities

### New Capabilities
- `on-you-page`: the list on the site of what is waiting for the signed-in member across their groups, its order, what each row shows, and acting from a row.

### Modified Capabilities
- `group-asks`: adds the "something to do" kind, how it is answered, and how its results and reminders are worded.

## Impact

- Database: one migration that lets an ask have the kind `done` with no options and lets its answer carry no choice and no text (a check, a trigger and an answer rule all change). The founder applies it by hand.
- `lib/emba/team-asks.ts` (new kind, answer shape), `lib/emba/team-waiting.ts` (a read for the site, ordered by time), `lib/emba/team-format.ts`, `lib/emba/team-card.ts`, `lib/emba/team-mcp.ts`, `lib/emba/reach-send.ts`, `lib/emba/reach-link.ts`, `scripts/emba-seed.ts` (wording and the done answer).
- Site: a new list component on the campus screen with its actions and styles, `app/a/[token]/page.tsx`, `app/a/actions.ts`, `app/groups/reach/answer/[token]/page.tsx`, `app/groups/reach-actions.ts` (done button and wording), `components/emba/ask-parts.tsx` (the new kind in the ask form and rows).
- Access: the groups site, including every ask's page, is closed to everyone but the admin today. The list links to those pages, so this change must open the ask page and the emailed answer link to members of the ask's group (`proxy.ts`, `lib/emba/portal-session.ts`). How far to open is the founder's decision (design D12).
- Not in this change: searching and joining open groups from the campus screen, claiming a CampusGroups club, uploading a roster, reading CampusGroups events (covered by `loop-group-event-links`), mentions and announcements on the list, and anything that pulls tasks out of email or chat.

## Why

After `loop-club-events-and-asks`, a member learns about a new ask or event only if someone pastes a link into the chat or the member happens to open Loop. The organizer still sends every reminder by hand. For "without chasing" to be true, Loop has to reach each member itself, in the way that member chose, and has to show up inside their assistant without being asked for by name.

This change is written before the first club change has been tested. It is expected to be revised after demo 2 of that change.

## What Changes

- Add a "what's waiting" read across all of a member's groups: unanswered asks, new events, mentions and announcements, as one short list. The connector tells assistants to check it at the start of a conversation.
- Show that list, events and asks as an interactive card inside assistants that support in-chat interfaces, with buttons to answer or mark interest. Assistants that do not support cards get the same content as text.
- Let each member choose, per group, how Loop reaches them: only in their assistant and on the site, by email, by WhatsApp, or not at all.
- **BREAKING for the team-layer posture:** Loop sends messages. Until now it sent nothing. It sends a message for a new ask, one reminder before an ask closes to members who have not answered, and an announcement when an organizer chooses to send it.
- Put a personal answer link in each message, so a member answers with one tap without signing in. The link works for that one ask and that one member, and stops working when the ask closes.
- Send by email first. Send by WhatsApp from Loop's own business number to members who opted in, with tap-to-answer buttons where WhatsApp allows them.
- Give organizers a view of interest building per event and answers arriving per ask, with a control to announce.
- Record how each answer and interest mark arrived, and give the operator pilot numbers: who connected an assistant, answer rates within 48 hours by route, and time to close.
- Not in this change: posting into an existing WhatsApp group (not possible), SMS, push notifications, payments, calendar invites (`loop-trip`).

## Capabilities

### New Capabilities

- `waiting`: the cross-group "what's waiting" read, the instruction to assistants to check it, and the in-chat card with its text fallback.
- `reach-preferences`: a member's per-group choice of how Loop reaches them, its default, and how it is changed.
- `outbound-messages`: what Loop sends and when, limits and quiet hours, personal answer links, email delivery, and WhatsApp delivery from Loop's own number.
- `organizer-view`: the organizer's page of interest and answers over time, and announcing.
- `pilot-metrics`: operator-only aggregate numbers for the pilot, with CSV export.

### Modified Capabilities

None of the capabilities in `openspec/specs/` change. This change builds on `group-events` and `group-asks` from `loop-club-events-and-asks`.

## Impact

Root Next.js application: `lib/emba/team-read.ts`, `lib/emba/team-mcp.ts`, `lib/emba/delivery.ts` and its outbox tables, new reach and messaging modules, the `/groups` pages, a scheduled route for reminders, and inbound webhook routes for WhatsApp. One additive migration. New dependencies, each needing the founder's approval before it is added: the MCP in-chat interface package, an email provider, and the WhatsApp Business Platform. Founder setup with lead time: a sending domain for email, and a Meta business account, phone number and approved message templates for WhatsApp.

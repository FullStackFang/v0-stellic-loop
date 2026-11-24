## Why

Loopd's assistant tools cover teams: decisions, asks, travel. None of them reach the campus side, so a student cannot ask their assistant what is on tonight or who they know is going. A small set of five tools does that, with one firm rule: an assistant may look and may note interest, but joining a group and finishing an outing need the person's own tap.

## What Changes

- A second, small assistant connection for going out, beside the team one, with five tools: `find`, `whos_in`, `interested`, `join`, `close_loop`.
- `find`, `whos_in` and `interested` work on the assistant's say-so. They name only people the person knows; everyone else is a count.
- `interested` is new to the campus side: a private mark on an event. Nobody sees it, except that two people who know each other and are both interested in the same event are each told about the other.
- `join` and `close_loop` never act when the assistant calls them. They return a card with a button; the person's tap does it. Where an assistant draws no cards, they return a link to the same step in Loopd.
- Checking in stays a button on the phone. No tool does it.
- A card for these tools in the look already picked for the team card.
- Mockup: `public/demo/mockups-six-adds.html`, section 4.

## Capabilities

### New Capabilities
- `campus-assistant-tools`: the five tools, what each may do alone, what needs a tap, and what an assistant is told about other people.

### Modified Capabilities

(none)

## Impact

- New: `lib/campus/assistant.ts` (the server and tools), `lib/campus/assistant-card.ts` (the card), `lib/campus/interest.ts`, route `app/api/mcp/campus/route.ts`, a confirm page under `app/c/`.
- Reuses `handleMcpRequest` sign-in from `lib/emba/mcp.ts`, `imIn`, `outingsOn`, `knownTo`, and `timesOut` from `campus-going-together`.
- Migration: table `campus_interest`, table `campus_tap` (the one-use confirm codes), column `campus_outing_member.closed_at`. The founder runs it on production.
- The Assistants page (`/groups/connections`) gains the second address.
- The team tools do not change.

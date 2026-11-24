## Context

The team tools live in `lib/emba/team-mcp.ts` (27 tools) behind `/api/mcp/team`. `handleMcpRequest` signs the caller in and yields a `Principal` with a `personId` and `verifiedEmail`. Each tool returns a text form that is complete alone and a structured form. Four team tools declare the in-chat card (`lib/emba/team-card.ts`, look "B Panel"), whose tests forbid loading or embedding anything and cap its size.

On the campus side a person is in an outing (`campus_outing_member`) or not. There is no softer state. `imIn` joins, `leave` leaves before check-in, `checkIn` needs the phone near the place.

The team tools' own rule for writes is "saves at once under the user's name". This change is stricter on purpose for the two tools that commit a person to other people.

## Goals / Non-Goals

**Goals:**
- Five tools, each small enough to describe in one line.
- A tap that an assistant cannot fake.
- The same people rule as the app: names for people you know, counts for the rest.

**Non-Goals:**
- Paying, booking, or messaging anyone.
- Inviting through an assistant. Invite stays in the app.
- Checking in through an assistant.
- Changing or shrinking the team tools.
- Showing "interested" inside the app pages. That needs its own mockup.

## Decisions

**D1. A separate server.** `createCampusMcpServer` in `lib/campus/assistant.ts`, served at `/api/mcp/campus`, named `loop-campus`. Same sign-in as the team route. Alternative: add five tools to the team server. Rejected: the founder wants the small set to stand apart, and a student with no team should not see 27 tools they cannot use.

**D2. Who may use it.** The caller must have a campus (`campusOf` with the principal's verified email). Without one, every tool answers that a school email is needed, with the sign-in address.

**D3. `find`.** Input: `when` (today, tonight, tomorrow, week; default tonight), optional words. Output: up to eight events from the person's campus, ranked by the same pull as the screen, each with title, time, place, walking time when known, count going, the first names of known people going, whether the person is in or interested, and an event reference. Deals follow the deals rule: only while running.

**D4. `whos_in`.** Input: an event reference. Output: first names of known people going (most times out first), a count of the rest, and any known person who is also interested (D5). Never a name of someone the person does not know.

**D5. `interested`.** New table `campus_interest(listing_id, person_id, created_at)`, primary key on both. Setting it is private. The only reveal: when two people who know each other are both interested in the same event, `find` and `whos_in` tell each about the other. Joining the event removes the mark. Input: event reference and `on` (default true). This is the "only reveal the overlap" idea in its smallest form. Alternative: make `interested` an alias of "I'm in". Rejected: it would commit the person to a group with no tap.

**D6. The tap.** `join` and `close_loop`, called with no code, change nothing. They make a row in `campus_tap(code, person_id, action, listing_id, outing_id, expires_at, used_at)` that lasts ten minutes, and return:
- text telling the assistant to ask the person to press the button, and a link `/c/tap/<code>` that does the same step in Loopd after sign-in;
- the card, which receives the code in the part of the result meant for the card and not for the model.

Checked for task 4.1 (`openspec/changes/loop-club-reach/notes.md`, "Tool result fields"): the MCP Apps spec gives a tool result's `_meta` as "Additional metadata ... not intended for model context", and the host hands the whole result, `_meta` included, to the card in `ui/notifications/tool-result`. So the code goes in the result's `_meta` (`_meta.tap`), never in `content` or `structuredContent` (which Claude Code passes to the model as JSON). A host that does give `_meta` to the model would break this; the link path, which needs the person signed in and pressing, still holds there.

Found while building: if the link carried the card's code, an assistant could read it out of the text and call `join` with it. So a tap has two codes, `code` (the card's, in `_meta` only) and `link_code` (in `/c/tap/<link_code>`). The tools accept only the first and the page only the second; a press on either uses the tap.

Faces on the card are initials in discs, not the animals: the card loads nothing, and sending the pictures inline would put image data in what the model reads.

The card's button calls the same tool with the code; the server checks it belongs to the caller, is unused and unexpired, then acts and marks it used. The link page does the same on a button press, never on load. Alternative: let the assistant pass `confirm: true`. Rejected: that is the assistant confirming for the person, which is the thing being ruled out.

**D7. `join`.** Acts through `imIn`, so the outing joined is the one "I'm in" would pick. The pending answer says who the person would be with. Refusals are the app's own: event ended, no longer listed.

**D8. `close_loop`.** Allowed once the event has started and the person has checked in. It sets `campus_outing_member.closed_at` for that person and returns who checked in. After it, the outing no longer comes up as open in `find`. It grants nothing: counting toward levels and times out comes from check-in, as today. See Open Questions.

**D9. The card.** A new resource `ui://loop/campus-card-v1.html` in `lib/campus/assistant-card.ts`: plate header, event rows with small faces, pill buttons, the tight corner. Same limits as the team card (nothing loaded, size cap), tested the same way. Faces are the people's animals, sent as the picture addresses the app already serves.

**D10. Tool notes.** `find` and `whos_in` are marked read-only. `interested` is a write that is easy to undo. `join` and `close_loop` are described as "returns a button for the user to press; never completes on its own". Text from events is marked untrusted, as in the team tools.

**D11. Connecting.** The Assistants page lists a second address, "Going out", under the existing one. Production scopes and clients are set in the Clerk dashboard by the founder; the same client and scopes are reused, so no dashboard change is expected. Confirm before landing.

## Risks / Trade-offs

- [An assistant shows the code to the model and calls back itself] → The code goes only in the card's part of the result; the text carries the link, which needs the person signed in to Loopd and a button press. Test that the code is absent from the text and structured parts.
- [An assistant that draws no cards] → The link path works everywhere.
- [`interested` with no surface in the app is easy to forget] → `find` lists what the person marked. An app surface is a follow-up with a mockup.
- [Two connections confuse people] → One line each on the Assistants page; see Open Questions.

## Migration Plan

One migration: `campus_interest`, `campus_tap`, and `campus_outing_member.closed_at`. All additive. Before it runs, the campus route answers every tool with "not set up yet" and the Assistants page does not list the address. The founder runs the SQL on production; the reply that lands this pastes it.

## Open Questions

- "Close the loop" is read here as "this outing is finished for me". If gigi meant something else (settling a bill, rating the place), `close_loop` changes or is dropped and the set is four.
- Should the two connections become one address that offers both sets, so a student connects once?
- Should a match on `interested` also show in the app? Not in this change.

## Context

This change depends on `loop-club-events-and-asks`. It assumes groups have dated events, interest, asks, answers and share links.

Three facts shape it:

1. An assistant speaks only when its user asks it something. Loop cannot make Claude or ChatGPT open a conversation. Anything with a deadline needs a channel Loop controls.
2. Assistants that support the MCP in-chat interface extension can render a small interactive page returned by a tool. Claude has done so on web and desktop since January 2026. Support in ChatGPT was reported and was not confirmed when this was written.
3. A WhatsApp business number cannot join a group's existing chat. It can message a member one to one after that member opts in, using message templates approved in advance. These rules were gathered from vendor guides on November 12 and must be checked against Meta's own documentation at build time.

`loop-team-layer` stated that Loop sends nothing. This change ends that.

## Goals / Non-Goals

**Goals:**

- A member who never opens Loop still hears about an ask in time to answer it, by the route they chose.
- A member who is in their assistant sees what is waiting on their next question, as a card where the assistant supports one.
- The organizer stops sending reminders by hand.
- The pilot can measure whether assistants check Loop unprompted and which route gets answers.

**Non-Goals:**

- Posting into a group's existing WhatsApp chat.
- SMS or mobile push.
- A message for every change. Interest marks and single answers never trigger a message.
- Ranking or reporting members by responsiveness.

## Decisions

### D1. "What's waiting" is one cross-group read

A new tool, `waiting`, takes no group and returns, across every group the calling assistant has a grant for: open asks the member has not answered (closing soonest first), events the member has not acted on, records that mention the member, and announcements not yet shown to them (D8b defines "waiting"). At most 10 items, then "N more in <group>". It is read-only and cheap.

`whats_new` stays as the per-group, cursor-based history. `waiting` is the short answer to "is there anything I need to do".

The connector's server instructions and the tool's description tell the assistant to call `waiting` once at the start of a conversation and to mention the result briefly only if something is waiting. Loop cannot enforce this. D8 measures it.

### D2. The card is a view of the same data, never more

`waiting`, `events`, `ask` and `ask_results` attach an in-chat interface where the assistant supports it. The card shows exactly what the text form states and offers buttons that call the existing tools (`answer`, `interested`). Every result keeps its full plain-text form alongside its structured form, so an assistant without card support loses nothing.

Those write tools are callable both by the model ("mark me as in") and by the card (a button tap), and both paths go through the same grant, role and cap checks. After a write the card updates in place: counts, the member's own state, and ask totals.

The card is one self-contained page: scripts and styles inline, nothing loaded from outside Loop. Member-written text is escaped and shown as text. It follows the host's light or dark theme and the style values the host provides, with no fixed colours that break in dark mode. It has a loading state, an error state ("Couldn't reach Loop. Try again") and an empty state ("Nothing waiting from your groups"). It is compact, because it sits above the assistant's real answer.

Alternative considered: a link to the site instead of a card. Kept as the fallback in every text result.

### D2a. One card for every assistant

The founder's prototype brief of November 12 sets portability as the most important constraint, and this change adopts it:

- Use the standard keys and the standard bridge of the MCP in-chat interface extension for everything. One codebase serves Claude and ChatGPT.
- Depend on no host-specific interface. A host-only nicety is feature-detected and degrades cleanly when absent.
- Add a host's compatibility aliases only where that host's current documentation says they are still required.

Before any code is written, the current documents are read and summarised in a notes file in the change: the extension's specification and examples, its SDK documentation, and OpenAI's pages on in-chat interfaces for connectors. Where this design conflicts with those documents, the documents win and the conflict is recorded. Differences found between Claude and ChatGPT are kept in a compatibility note.

The package that provides the card is a new dependency and needs the founder's approval.

### D2b. A throwaway prototype may run first

The same brief describes a prototype on fake data, with a personal address per member in place of sign-in, built to test two assumptions with five to ten people: that members get through connecting, and that assistants call Loop at the start of a conversation when told to. It is a separate, disposable codebase and nothing in it ships.

This change is written so the prototype's findings drop straight in. Its tools map one to one: its pending-items tool is `waiting`, its RSVP is `interested`, its vote is `answer`. Its measurements are the ones in D8. Its wording for the server instructions is the starting wording here. Two things do not carry over: the personal address stands in for sign-in only in the prototype (the product uses the existing Clerk sign-in and grants), and the in-memory data is replaced by the group's real events and asks.

If the prototype shows assistants do not call Loop at the start of a conversation, section 2 of this change (the instruction and `waiting`) is kept, section 3 (the card) is reconsidered, and outbound messages carry the whole job.

### D3. Reach is chosen per member, per group

Four choices: in my assistant and on the site only; email; WhatsApp; nothing. "Nothing" still leaves everything visible on the site and in the assistant.

The default for a new member is email, to the address they signed in with, for asks and organizer announcements only. The join page states this in one line with the control to change it beside it. Every email carries a one-tap way to stop messages from that group.

Alternative considered: default to assistant-only. Rejected because, by fact 1, an ask would then reach most members only if they happened to open their assistant.

### D4. What Loop sends

Only these, and only to members whose choice allows it:

- A new ask, to members who can answer it.
- One reminder per ask, to members who have not answered, sent 24 hours before it closes, or halfway to closing when the ask runs less than 48 hours.
- An announcement, when the organizer ticks "send to members" on it.
- The result of an ask, to the person who asked, when it closes.

Limits: at most 3 messages per member per group per day and 10 per member per day across groups; beyond that, items wait for `waiting`. No message is sent between 21:00 and 08:00 in the group's timezone; it goes at 08:00 unless the ask has closed by then. A member who has already answered gets no reminder. A message never contains another member's answer or name, except the asker's name as the sender of the question.

Sends go through the existing outbox so a failed send is retried and a send is never duplicated. A scheduled route runs every 15 minutes to send reminders and deferred messages.

### D5. Personal answer links

Each message about an ask carries a link signed for one member and one ask. Opening it shows the ask with that member's name. Choosing an option records the answer without sign-in.

- A plain request for the link never writes anything, because mail scanners and chat previews fetch links. The answer is recorded only on the form's submission.
- The link stops working when the ask closes, when the member leaves the group, and when the member turns off messages for the group.
- It can answer that ask and do nothing else. It creates no session.

Anyone holding the link can answer as that member for that ask. That is accepted for asks, as it is for an RSVP link in an invitation, and is the reason the link can do nothing else.

### D6. Email first

Email is built first because every member has a verified address from sign-in and no third-party approval is needed beyond a sending domain. The provider is chosen at build time from the Vercel Marketplace and approved by the founder before it is added.

### D7. WhatsApp from Loop's own number, opt-in

A member chooses WhatsApp on their preferences page and taps a button that opens WhatsApp with a short pre-filled message to Loop's number. Receiving that message links the number to the member and records their opt-in. Sending "stop" ends it.

Messages Loop starts use approved templates: new ask, reminder, announcement. For a pick-one ask with up to three options the message carries reply buttons and a tap records the answer; otherwise it carries the personal answer link. Inbound webhooks are verified by signature before anything is read.

This section is separable. If the Meta account or templates are not approved when the rest is ready, the change ships without it and WhatsApp stays a share target as in the previous change.

### D8. Measuring whether assistants check Loop

This is the point of the card work, so it is measured and not assumed. For every connector request Loop records: the time, the member, the host (the client name and version the assistant states when it connects), the connector session where the host keeps one, the tool, whether the call came from the model or from a card button, and whether it was the first Loop tool call in that session.

From that the operator sees, per host: members who connected at least once; sessions in which `waiting` was the first call; sessions in which Loop was called late; sessions that connected and called no tool; and answers and interest marks made by card tap against those made by the model in text.

Limits, stated so the numbers are not over-read. The team connector is stateless today; it must hand out a session identifier for "first call in a session" to mean anything, and a host may reuse one session across conversations or open none until it calls a tool. A conversation in which the host never contacted Loop at all is invisible. So the log is paired with a scripted test: a fixed set of questions asked of each supported assistant with Loop connected, recording by hand whether it checked Loop first.

What is recorded is which tool was called and by what route. Tool arguments and results are not written to this log.

### D8a. The connecting funnel

The first assumption to test is that members get through connecting. Loop records, per member and host, the steps it can see: joined a group, opened the connect page, completed sign-in from an assistant, granted a group to that assistant, made a first tool call. The operator sees how many members reach each step.

The connect page is rewritten as plain steps a non-technical member can follow for Claude and for ChatGPT, including which plans allow a custom connector, with a screenshot beside each step.

### D8b. Waiting means not yet acted on

An item stays in `waiting` until the member acts on it or dismisses it, not until a cursor passes it. An ask is waiting until the member answers or it closes. An event is waiting until the member marks interest, says "not for me", or it ends. A mention or announcement is waiting until the member has been shown it once. This per-member state is what lets the card say "2 things from your groups" and be right the next day.

### D9. The organizer's view counts items, not people

The organizer sees, per upcoming event, the interested count by day; and per open ask, answers received over time against the number expected. The "who has not answered" list stays where the previous change put it, inside one ask. This page ranks nobody and has no per-member row.

### D10. Pilot numbers are operator-only and aggregate

Answers and interest marks record the route they arrived by: site, share link, personal link, assistant, WhatsApp button. The operator page shows, per group: members joined, members with an assistant connected, share of members answering within 48 hours by route, and median time from ask to closed. Groups under five members are shown to the operator only, and no number is broken down to a single member. Organizers do not see this page.

## How this is built

Same rules as the previous change: test first, a denial test for each rule, an independent review after the services and of the whole change, and demo points on the live site after the card (section 3), after email (section 5) and after WhatsApp (section 7).

## Risks / Trade-offs

- [Assistants ignore the instruction to check `waiting`] → Measured in D8. Email carries the deadline either way.
- [Card support differs by assistant and changes] → Text is always complete; the card is an enhancement. Docs are checked at build time.
- [Email by default feels like spam] → Asks and chosen announcements only, daily limits, quiet hours, and one tap to stop per group.
- [A personal link is forwarded] → It can answer one ask as one member and nothing else, and expires at close.
- [Meta approval or pricing changes] → WhatsApp is separable and last. Rules are re-read from Meta's pages before building.
- [A scheduled job misses a window] → Reminders are computed from the ask's closing time on each run, so a late run sends late, never twice.
- [Per-message cost] → Counted per group in `pilot-metrics` so the price per group can be checked against it.

## Migration Plan

One additive migration: reach preferences, linked WhatsApp numbers and opt-ins, personal link records, message log on the existing outbox, and the route column on answers and interest if the previous change did not add it. Rollback is turning the scheduled route off and dropping the new tables. Sending is behind one environment switch that is off until the founder turns it on.

## Open Questions

- Is email-by-default acceptable, or should the join page require an explicit choice before any message is sent?
- Which email provider, and which sending domain?
- Does ChatGPT render in-chat cards for custom connectors on the plans the pilot members have?
- Should organizers be able to change the reminder timing per ask, or is one fixed rule enough for the pilot?

## Found while building (2026-11-14)

Task 1.1 was done against the code of `loop-club-events-and-asks` as built. Its demo 2 has not been run and no findings from the throwaway prototype were available, so nothing here comes from either. Task 1.2 is in `notes.md`. Where the documents and this design disagreed, the documents were followed:

- **The existing outbox cannot carry these messages (D4).** `emba_outbox` is tied to the frozen cohort activity inbox. Messages get their own table, `emba_reach_message`, which is the outbox and the message log in one, on the same pattern: queued in the transaction that causes the message, sent by the scheduled route, at most one row per member per ask per kind.
- **Personal links are stored tokens, not signatures (D5).** Each message row carries an unguessable answer token and stop token, like the share links of the previous change. No signing secret is needed, and a link is checked against the ask, the membership and the member's choice when it is opened.
- **Routes (D10).** The route column already exists and is open. The migration adds `personal_link`, `assistant_card` and `whatsapp`.
- **Session identifier (D8).** The connector stays stateless. It mints an identifier when an assistant connects, returns it in the `Mcp-Session-Id` header, and uses it only as a label in the request log. This works for protocol revisions up to 2025-11-25, which is what the installed SDK speaks. Revision 2026-07-28 removes the header; when the SDK moves to it, the log will show calls without a session and this needs another look.
- **Host name and version (D8).** They are stated once, when the assistant connects, so they are stored on the session and read through it. A call without a session has no host.
- **Card or model (D8).** No assistant says where a tool call came from. The card adds `via: "card"` to its `answer` and `interested` calls. A model could send the same mark, so it is a count for the pilot and decides nothing. Card-only tools would be a stronger signal but would break "the same tools and checks" (D2); not done.
- **Card support is not detected (D2).** A stateless server sees the assistant's capabilities only when it connects. The card is declared on the tools unconditionally; the extension guarantees that an assistant without card support treats them as ordinary tools.
- **The in-chat interface package is not needed (D2a).** The current `@modelcontextprotocol/ext-apps` (2.x) does not work with the installed MCP SDK (1.32). The card can be declared with plain `_meta` keys and its bridge written by hand in the page, which the extension's specification allows. Task 1.3 becomes: approve that, or approve the 1.x package.
- **What waits (D8b), made exact.** An event waits only if it has a date; an event with no date is a label and never ends. An event does not wait for the person who added it, and an announcement or a record does not wait for its author. A claim proposed for a member counts as a mention. Nothing about asks or events waits for a follower, who can neither answer nor mark interest. A decline is the member's own note: no other member and no organizer is shown it.
- **ChatGPT (open question 3).** The feature is now "Plugins", added as a custom MCP server, documented for Business and Enterprise/Edu on the web. Whether members on personal plans can use the card's buttons is not confirmed. See `notes.md`.

### Found while building sections 4 and 5 (2026-11-14)

These are calls made during the build. Each needs the founder's yes or a correction.

- **Loop does not store members' email addresses.** The address is known only at sign-in. The scheduled run reads each member's verified primary address from the sign-in provider at the moment it sends (`clerkEmailOf`), so no copy is kept and a changed address is picked up. The alternative is a stored copy, which would be one more personal data item to export and delete.
- **The sending switch is the environment variable `LOOP_REACH_SENDING=on`.** While it is off nothing is queued, so turning it on does not release a backlog. One exception follows from "computed on each run": an ask that is open when the switch goes on, and whose reminder time has already passed, gets its one reminder on the first run.
- **The person who asked gets no message about their own ask** except its result. The result is sent only if the ask ended in the last 24 hours.
- **A sent announcement goes to followers too**, since they can read it. Asks go only to members who can answer.
- **"Per day" is the calendar day in the group's timezone.** A message stopped by a limit is marked held and is never sent later; the item stays waiting on the site and in the assistant.
- **A member who chose WhatsApp is sent nothing by email in its place.** Until section 7 exists such a message is skipped.
- **Personal answer links** (`/groups/reach/answer/<token>`) answer through the same service as the site. For that one call Loop makes a signed-in identity for the member that lasts 60 seconds and is never stored or returned. The route is recorded as `personal_link` by an argument only Loop's own code can set.
- **Stopping**: the link in the message opens `/groups/reach/stop/<token>`, which does nothing until its button is pressed. The mail program's own unsubscribe button posts to `/api/reach/stop/<token>` (RFC 8058), which stops the group in one step.
- **Pages**: the preferences page is `/groups/reach`, "Reach" in the side menu. The join form offers email, assistant-only and not at all; WhatsApp starts from the Reach page.
- **Not built**: the email provider's adapter (`lib/emba/reach-email.ts` returns no sender until task 5.1 is decided). With the switch on and no provider the scheduled route reports that and touches nothing.
- **An announcement cannot be about one event.** The organizer-view spec says "optionally about one event", but the team-records change made announcements belong to the whole team and the database refuses an event on one. The announce form therefore has no event choice. To have it, that earlier rule must be lifted in a migration; the founder decides.
- **The organizer view** is `/groups/<group>/organize`, linked from the team page for owners and organizers. Interest by day covers the last 14 days and counts marks still standing: Loop keeps no history of a mark that was taken back, so a past day's count can be lower than it was on that day.
- **The operator** is whoever's sign-in subject is listed in `LOOP_OPERATOR_SUBJECTS`. It is a separate list from `LOOP_PILOT_OWNER_SUBJECTS` (who may start a group), so a club organizer allowed to start a group does not see the numbers. Anyone else gets "not found" for `/groups/metrics` and its CSV.
- **The numbers**: "expected answers" is the members who can answer now, times the asks of that week, not the membership on the day of each ask. An answer changed later counts from its last change. The funnel groups by the host name an assistant states; "granted" means the member holds a grant for a group to that assistant's client.

### After the independent review (2026-11-14)

A reviewer with no part in the build read sections 2, 4, 5 and 6 against the specs. It found no way to read or change another member's data through the pages that need no sign-in. What it found in the sending loop was fixed:

- A message is now claimed, sent with no database transaction open, and marked afterwards (`claimed_at` on `emba_reach_message`, added to the migration, which has not been applied). The attempt is counted before the provider is called, so a run that dies after the provider accepted can send that row at most five times, ten minutes apart, each with the same id for the provider to de-duplicate. One failing row no longer stops the run, and a run stops taking rows after 45 seconds.
- A group whose address was retired has its queued rows dropped. Before, they stayed queued for ever and 60 of them would have stopped all sending.
- A failure to reach the sign-in provider is tried again; only "no verified address" is final.
- Rows of a team in its quiet hours no longer stand in front of other teams' rows.
- A reminder is not written while the same ask's first message is still waiting, nor within 3 hours of it.
- One member's rows are decided one at a time, so two runs at once cannot both pass the daily limit.
- The scheduled route refuses to send when `NEXT_PUBLIC_APP_URL` is not an https address, since every link would be dead.
- A stop link used after the member left saves no choice. The join form's choice is always saved, email included. A choice made with a request to join survives until the request is settled.
- The pilot numbers leave out any assistant row or group row that counts fewer than 3 members, and the request log records a call only when it names a real tool.

Left for the founder, not changed:

- **Joining by invitation shows no line about how the group will reach the member.** The spec asks for it on every join. The invitation is accepted from a compact plate on the groups page, and adding a sentence and a control there is a design change.
- **A personal answer link works again** if the member turns messages back on or rejoins while the ask is open, and choosing "assistant only" does not disable it. The spec says the link "stops working" on leaving or stopping; whether it may come back is not said.
- **A member locked or banned at the sign-in provider** can still answer through a link already delivered until the ask closes, because Loop does not ask the provider on that path.
- With the switch on and no email provider, asks still queue their messages, so open asks' messages go out when a provider is added. Leave the switch off until the provider is in.
- A member who joins after an ask's reminder time gets the reminder without ever having had the first message.

### Found while building the card, section 3 (2026-11-14)

The founder was shown the choice in task 1.3 with the hand-written bridge recommended, and answered "continue". That is taken as a yes to the hand-written bridge. No package was added. If the 1.x package is wanted instead, only the script inside `lib/emba/team-card.ts` changes.

- **Where the card is.** One page, `lib/emba/team-card.ts`, served as the resource `ui://loop/card-v1.html`. The address is a cache key: change the version in it when the page changes in a way an old copy would break.
- **What it is declared on.** `waiting`, `events`, `ask` and `ask_results` carry `_meta.ui.resourceUri`. `answer` and `interested` carry nothing, so the model and the card call the same two tools (D2). OpenAI advises attaching a card to one "render" tool only, to avoid redrawing; the design's four tools are kept, and this is something to watch in ChatGPT.
- **The `ask` tool's structured result now names the team.** The card needs the team to send an answer back. The text form already named it.
- **The card draws at most 5 items** and counts the rest ("3 more: ask your assistant to list them"). Claude's guidance is 4 to 5 data points with no scrolling inside the card, and its mobile app cuts off a tall card. The text form still lists up to 10.
- **A written-answer ask has no text box in the card.** It says "tell your assistant what to say". Claude's guidance puts free text in the chat box, not the card.
- **Pick-any and dates asks** show the options as switches and one "Save" button. Nothing is sent until "Save".
- **Refusals are worded for the member, not copied from the text.** The text form speaks to the assistant ("call interested with..."). The card says, for example, "This ask has closed. Nothing was saved." or "Too many changes this hour. Try again later."
- **"Try again" on a failed result repeats only a read** (`waiting`, `events`, `ask_results`), and only when the assistant told the card which tool it was. The card never repeats `ask` on its own.
- **Taking interest back** is a separate button, "Take it back".
- **A card's repeat of `waiting` is logged as a call by the model.** Only `answer` and `interested` carry the card mark. It can make the "checked first" numbers very slightly high; it happens only after a failed read.
- **No ChatGPT-only call is used**, including the one for height. See `compat.md`.
- **Not tested in any real assistant.** The test runs the real page against the real connector with the test standing in for the assistant. Task 3.4 stays open.

### After the independent review of sections 2 and 3 (2026-11-14)

A reviewer with no part in the build read the waiting read and the card against the `waiting` spec. It found no blocker, no way for member text to become markup, and nothing the card can do that the model cannot. What it found was fixed:

- **A mention or announcement could be used up without being told.** The text form holds about 2,900 characters; when asks and events filled it, an announcement further down was left out of the text and still noted as shown. Now only what the text states is noted. The rest comes back on the next call.
- **The waiting text now states what the card draws for an ask:** its kind, "3 of 14 answered" and its options, each on a quoted line. This settles the point left open above ("one point where the card shows more than the text"). The cost is that fewer items fit the text of an assistant with no card; none is lost, they come back.
- **A slow tap no longer reads as a failure.** A tool call from the card is given 250 seconds, the longest an assistant allows, because the assistant may put its own approval prompt in front of it. It was 30 seconds.
- **Taking interest back is its own button, "Take it back".** A second tap on "I'm in" used to do it, and on a plan that cancels a calendar entry.
- **A refused pick-any answer keeps the member's selection.**
- **An assistant that draws cards and passes on no tool calls** gets the card with its controls switched off and "To answer, tell your assistant."
- **A result that carries text alone** is shown by its first line. A handshake that gets no answer no longer leaves the card at no height.
- **An event or ask removed after the card was drawn** says "This is no longer there."

Left as they are, for the founder to know:

- **Two small differences between card and text remain.** The card shows a question exactly as written; the text form replaces a link in it with "(link omitted)". The card shows the text as plain characters, never as a link.
- **The card's headline does not recount** after a tap ("2 things from your groups" stays).
- **If the assistant hands the card the same result twice,** the card redraws from it and a tap already saved looks unsaved until the next result. Nothing is lost on the server. OpenAI's documents say ChatGPT may redraw; to watch in 3.4.
- **Only the standard nested key declares the card.** The older flat key, which the extension's own helper still writes, is not added. If Claude does not show the card in 3.4, that is the first thing to try.
- **A member in more than 50 groups** gets what is waiting in 50 of them, with no note about the rest.
- **Two `waiting` calls at the same moment** can both return the same announcement.
- **Not covered by a test:** the size the card reports (the test DOM has no layout), and how the card draws a mention, an announcement or an idea.

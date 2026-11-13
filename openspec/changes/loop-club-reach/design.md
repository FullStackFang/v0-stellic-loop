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

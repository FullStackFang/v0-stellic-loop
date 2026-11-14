## Context

`loop-team-layer` is live: groups, Clerk sign-in, per-assistant grants, the team connector at `/api/mcp/team`, records (outputs, decisions, claims, announcements), a per-team change sequence behind `whats_new`, and events as named labels. On November 12 the live database held two signed-in people and no group, so no real group has used any of it yet.

A club is the same kind of group with more members and a different rhythm: things happen on dates, and the organizer needs answers from many people. The group's own chat is WhatsApp and stays there. Loop does not post into it; a person shares a Loop link into it.

The founder's words for the goal: three things a member can do are tell a group something, ask a group something, and say they are interested.

## Goals / Non-Goals

**Goals:**

- A member can see what is coming up and who is interested, from their assistant or the site.
- Anyone in the group can ask a question once and see answers arrive, without chasing each person.
- Everything works with no assistant connected: the site and a link are enough.
- Two demo points the founder can test: events and interest first, asks second.

**Non-Goals:**

- Loop sending anything on its own (email, WhatsApp, push). That is `loop-club-reach`.
- Posting into an existing WhatsApp group. The WhatsApp platform does not let a business number join one.
- Answering without signing in. A member signs in once when they join and stays signed in on that device.
- Turning interest into a confirmed plan or a calendar invite. That is `loop-trip`.
- Private notes, matching, or anything hidden until a threshold.

## Decisions

### D1. Events gain facts; they stay labels

`emba_team_event` gets `starts_at`, `ends_at`, `place`, `url` and `note`, all optional. An event with no date still works as a label for records, as today. Access is still decided at the group (team-layer D12).

Alternative considered: reuse the frozen cohort `emba_activity` tables, which already have commitments. Rejected: they carry the prepare, approve, execute flow the founder removed on November 9, and they are frozen.

### D2. Interest is one switch, named inside the group

A member is interested in an event or is not. There is no "going", "maybe" or guest count. Members and followers of the group see who is interested. To an assistant a person appears by handle, or as "a teammate" when they have none, as in team-layer D7; the site shows names.

Someone who is not in the group can see an event only through its share page, and there sees the event's facts and a count of interested members only when that count is five or more. Below five the page says nothing about interest. This applies team-layer rule 5 (aggregates for non-members need at least five).

The founder floated naming by closeness ("connected" people named, others not). Deferred: it needs a notion of connection that does not exist. One rule is simpler to explain and to test.

### D3. Asks are their own tables, not records

An ask has a question, a kind, options, a closing time, a reveal setting and answers. None of that fits `emba_team_record`, whose kinds share one version history. Asks get `emba_ask`, `emba_ask_option`, `emba_ask_answer` and a share-link table.

Kinds: `one` (pick one of 2 to 10 options), `many` (pick any), `dates` (options are days, pick any) and `text` (one line, up to 400 characters). An ask must have a closing time, at most 60 days out.

Reveal is chosen by the asker: `named` (members see who answered what) or `counts` (members see totals only; nobody, including the asker and organizers, sees who chose what). A `text` ask with `counts` shows the answers without names. Reveal cannot change after the first answer.

### D4. One answer per member, changeable until close

A second answer replaces the first. An ask closes at its closing time, or earlier when the asker or an organizer closes it. A closed ask accepts no answers. Closing is checked at write time against the database clock, not by a scheduled job, so no cron is needed in this change.

### D5. Any member may ask; organizers and owners add events

Asking is one of the three things every member can do, so it needs only the right to post. Caps keep it from flooding (D10). Events are the group's calendar and stay with owners and organizers.

### D6. Organizers may act through their assistant, for events and asks only

Team-layer code treats a person as a manager only on the site (`manager: p.clientId===null && …`). The founder asked that the lead can work "from the portal or their own LLM, either one". This change lets an owner or organizer add, change and archive events, and close any ask, through an assistant that holds a read-and-write grant for that group.

It does not extend to the brief, announcements, membership, roles or grants. Those stay site-only. This is a deliberate change to the earlier posture: a confused or compromised assistant could add or archive events. The limits are the caps, the change log naming the assistant, and that an archived event can be restored on the site.

### D7. "Who has not answered" is shown to the asker and organizers only

Team-layer rule 4 says Loop never reports who has been quiet. An ask is different in kind: a named person asked the group a direct question, and the list of who has yet to answer is the reason the feature exists. The exception is scoped tightly:

- The list is visible to the person who asked and to the group's owners and organizers. Other members see only "9 of 14 answered".
- It exists only while the ask is open and for 7 days after it closes.
- It covers only that ask. Loop computes no cross-ask view of quiet members, and no tool returns one.
- The ready-made reminder names nobody: "5 still to answer by Friday: <link>".

This relaxes rule 4. The founder agreed to "see who's missing" and "nudge" on November 12; the spec records the narrow form.

### D8. The share link carries no access

Each ask and each dated event has a share link, `/a/<token>` and `/e/<token>`, with an unguessable token. The token identifies the item. It grants no access and no membership.

- Signed in and a member: the page shows the item and the member acts on it.
- Signed in, not a member: the page shows what a non-member may see (D2 for events; for asks the question, the group's name and the closing time), and a way to join (see `open-join`).
- Signed out: the same non-member view, with sign-in.

The link preview shown by WhatsApp carries the same non-member view and nothing more: no answers, no counts for asks, no names.

"Send to WhatsApp" is a plain `https://wa.me/?text=…` link with the message and the share link filled in. Loop sends nothing; the person picks the chat. No WhatsApp account or API is involved.

### D9. Everything enters the existing change sequence

New events, changed event dates, new asks and closed asks enter the per-team change sequence that `whats_new` already reads. `emba_team_change` currently points at a record; the migration lets a change point at an event or an ask instead. Interest changes and individual answers do not enter the sequence: they would drown it, and "who answered when" is the kind of activity trail rule 4 exists to avoid. `whats_new` adds one computed line per open ask the caller has not answered, and marks those closing within 48 hours.

### D10. Caps

Per group: 50 upcoming events, 20 open asks. Per member per group: 5 open asks of their own. Per ask: 10 options. Field limits: question 200 characters, option 80, text answer 400, place 120, note 600. Writes count toward the existing 30 writes per hour per person and assistant. A capped call explains itself and saves nothing.

### D11. Leaving and deletion

When a member leaves a group: their interest is removed, their answers to open asks are removed, their own open asks are closed, and their answers to closed asks stay as "a former member". On account deletion the same happens in every group and the kept answers lose their link to the person. Export lists the person's own interests, asks and answers.

### D12. Joining without approval is the organizer's choice

See `open-join`. The existing request link stays as it is by default. An organizer can switch it to admit on sign-in. A person admitted this way becomes a member with the right to post, never an organizer.

### D12a. Room for the in-chat card and its measurements

`loop-club-reach` adds an interactive card inside assistants and measures which route each answer came by. Two choices here keep that cheap. Every tool result has a complete plain-text form and a structured form with stable field names, so a card can be drawn from the structured form without changing the tools. And every answer and interest mark stores its route from the first day, so the pilot numbers cover this change's data too.

### D13. One migration, applied by hand once

All tables and columns for this change go in one migration file, because production migrations are applied by the founder by hand. Events and interest are built and demonstrated first, asks second, on the same schema.

## How this is built

The founder asked on November 12 to move quickly and to review in stages.

- Test first for every service rule, with one test per denial (wrong role, no grant, capped, closed, not a member).
- Two independent reviews with a fresh context: after the migration and services, and of the whole change before it ships. Findings are checked against the code before they are acted on.
- Two demo points on the live site: after section 4 (events and interest) and after section 7 (asks).
- Work stops and the founder is asked when a fix would change a requirement, or when a step needs the hosted database or the Clerk Dashboard.

## Risks / Trade-offs

- [The link path is close to a free poll] → The pilot compares a Loop ask with a WhatsApp poll in the same group. If the ask does not win on answers within 48 hours, the feature is not earning its place.
- [Loop cannot remind anyone in this change] → The asker still sends the reminder by hand. Automatic reminders are `loop-club-reach`; this change makes the hand version one tap.
- [An approval-free join link can be passed around] → It is off by default, an organizer can switch it off or replace the link at any time, and members can be removed.
- [Organizer writes through an assistant] → Scoped to events and asks, capped, logged with the assistant's name, and reversible on the site.
- [The rule 4 exception grows] → The spec forbids any view across asks, and a test asserts no tool returns one.
- [Members with no handle read as "a teammate" in an assistant] → The join page prompts for a handle; the site always shows names.

## Migration Plan

One additive migration: new columns on `emba_team_event`, new tables for interest, asks, options, answers and share links, a wider `emba_team_change`, and a join-mode column on the request link. Nothing existing is rewritten. Rollback is dropping the new tables and columns; no existing row depends on them. The founder applies it on `supabase-loop` by hand before the first demo.

## Open Questions

- The live database has no group. Task 1.1 finds out whether a signed-in person can create one on the site today; if only an operator can, a create-group step is added before anything else.
- Should a `counts` ask still show the asker who has not answered? This design says yes: it reveals that a person answered, not what they answered.
- Is 5 the right floor for showing a count to non-members of a small club? It is inherited from the team-layer rule and can be changed in one place.

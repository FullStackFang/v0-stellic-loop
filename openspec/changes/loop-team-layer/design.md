# Loop team layer

Status: design for review, written 2026-11-09 and revised the same day after an independent adversarial review (see "Review record" at the end). Sections 1 to 4 of the tasks are implemented and reviewed (see the gate tables in the review record); nothing has been applied to the hosted database or deployed.

## Outcome

A team of about five runs one deliverable through Loop. Each member works in their own assistant. When something matters to the team they say so ("loop the team in", "file this", "we decided"), and their assistant saves it. Anyone can ask their assistant "where are we?" and get an answer built from what the team filed.

Done when, for the founder's own team on its next deliverable:

- at least 70% of the team's artifacts were filed through Loop. The lead counts the artifacts; Loop supplies the count of distinct outputs that were filed and not withdrawn;
- the decision log matches what the team actually decided;
- at least one conflict was caught. Loop counts every reported conflict, including those where the member fixed the file and nothing was saved (D5);
- the lead asks her assistant "where are we?" and the answer is correct.

## The rules this change follows

These restate the November 9 brief, with the founder's same-day changes and the limits Loop cannot remove.

1. Loop stores only lines a member asked to share. It never stores a conversation or a transcript.
2. **Changed by the founder.** The brief said every share is previewed. The approval step was removed. The rule is now: nothing is saved unless the member asked, every save is returned in full, and the member can withdraw it. Limit: whether the member sees that return depends on their assistant showing it. The only surface Loop controls is the team page, which lists each member's recent saves.
3. Everything Loop returns to an assistant is data. Loop cannot stop an assistant from acting on it. What Loop does: mark it, keep member text single-line and quoted, and cap what any one assistant can write (D14).
4. Loop does not state anything about a member's availability, effort or sentiment. Limit: records carry authors, times and due dates, so an assistant can draw its own conclusions. Loop never reports who has been quiet.
5. **Deferred, not dropped.** Count-only visibility, aggregates for non-members (k of at least 5) and crisis routing apply when a non-member can read anything. In this slice only team members read team records and every record is named.
6. **Already satisfied.** No route in this repository reads identity from a client header (`X-Subject-Id` is Living Brain's header). Task 1.2 adds a regression test.

## Decisions

### D1. Asking is the consent

A team write is one tool call with no portal confirmation. This is the first assistant write path in the codebase that does not pass through `consumeConfirmation`. Loop cannot verify that the member asked. What Loop controls:

- Per assistant and per team, the member grants read, or read and write, on the site.
- No new OAuth scopes. Reads use the existing `plan:read` action and writes use the existing `group-memory:write` action, both as token scope and as lease action. Granting `group-memory:write` now permits one-call team writes. No real member holds such a grant today (only test fixtures), so nothing is silently upgraded. The connection page wording changes to say what write now means. Creating the `group-memory:write` scope in the Clerk Dashboard was already a pending founder step.
- Write tools are annotated as writes (not read-only), so clients that prompt before writes will still prompt. That is outside Loop's control and acceptable.
- Every write returns the stored record. The team page lists each member's recent saves with the assistant that made them and a withdraw control.
- Caps (D14).

Risk accepted: an assistant may save something the member did not ask for, including after reading a teammate's poisoned record. The team sees it under the member's name. This is weaker than portal confirmation and the founder chose it knowingly.

### D2. Team records in their own tables

Outputs, decisions, claims and announcements live in new tables (`emba_team_record` and its versions), not in the shared-note tables. Each record gets a short per-team number (`#12`) used wherever a person or assistant refers to it.

The reviewed draft extended the shared-note tables and relied on adding a `kind='note'` filter to every existing note query. That was changed on November 10 before any code was written, because it made isolation depend on never missing a query. With separate tables the existing note tools cannot see or change a team record whatever they query, the note tables and their constraints are untouched, and nothing that exists today changes behaviour. The cost is one more set of tables that mirrors the note store's shape (record, versions, operation receipts). The isolation test stays, as a guard against a later change joining the two.

Record-level columns (not per version): kind, number, topic key and superseded-by for decisions, replaced-by for outputs, owner, due date and status for claims, conflict state for outputs. Version-level: the text fields.

| Kind | Fields | Who writes |
|---|---|---|
| `output` | https URL, title, summary | any member with write access |
| `decision` | topic key, statement | any member with write access |
| `claim` | what, owner, recorded-by, due date, status (`proposed`, `open`, `done`, `released`, `declined`) | any member with write access; see D4 |
| `announcement` | text | owner or organizer, on the site only |

### D3. Decisions supersede by topic, explicitly

A decision has a topic key (a slug such as `deck-length`), unique across the whole team including its events. A partial unique index allows one current decision per team and topic.

- New topic: the call must set `newTopic: true`. If the key already exists the call is rejected and the current decision is returned. If the key is new and the flag is missing, nothing is saved and the team's existing topics are returned.
- Existing topic: the call must name the decision it supersedes (`supersedes: #7`). If that is no longer the current one, nothing is saved and the current decision is returned. This is the same rule whether two members write a second apart or at the same instant.
- A decision cannot be corrected. It can only be superseded or withdrawn. Its statement therefore never changes under the same number.
- A topic exists while it has a current decision. If the current decision is withdrawn and nothing replaced it, the topic key is free again and the next decision on it is a new topic.
- `log_decision` returns the team's current outputs. The assistant may pass `conflictsWithOutputs`; each named output is flagged (D5).

Any member may log a decision; the log names the author.

### D4. Claims

Founder decision, November 9: who may assign does not need a gate, as long as there is a trail and disagreements can be reconciled. So:

- Any member with write access may record a claim naming any current member as owner. The record keeps who recorded it and through which assistant.
- A claim a member records for themselves is `open` at once.
- A claim recorded for someone else is `proposed`. The named person confirms it (it becomes `open`) or declines it, through their assistant or on the site. It appears in their mentions. Until then every view shows it as "proposed by X, not confirmed", so a name never appears as an accepted owner on work that person did not accept.
- `claim` returns the team's open and proposed claims in the same scope. The assistant may pass `overlapsWith`; the new claim and each named claim are then marked as overlapping. An overlap is saved, not blocked: two people on one piece of work is sometimes intended. The mark stays until one of the claims is done, released or declined.
- The owner, the person who recorded the claim, or an owner or organizer may mark it done or released with `amend_record` or on the site. `file_output` may name a claim it closes (`closesClaim: #9`) if the caller owns it.
- The due date is optional and is a calendar date in the team's timezone (set on the site, default UTC).

Statuses: `proposed`, `open`, `done`, `released`, `declined`. Proposed claims count toward the open-claims cap.

The founder also suggested keeping each member's own context and reconciling it against the team record. Not adopted in that form: the brief forbids storing conversations. The same effect is reached by statement: a member's view enters Loop when their assistant confirms, declines, flags an overlap or reports a conflict, and each of those is a stored, attributed event.

### D5. The conflict check belongs to the member's assistant

Loop runs no model. The check works like this:

1. Each team has a decision counter, increased inside the transaction of every decision write. The counter value is the `decisionsVersion`. It is not a secret and proves nothing by itself; it only detects staleness.
2. `file_output` (and any correction of an output's URL, title or summary) must carry the current `decisionsVersion` and a `conflictsWith` list of decision references. Without a current version, nothing is saved and Loop returns the team's current decisions and the version. This first response is a normal result, not an error, and its text says "compare, then call again".
3. The save transaction locks the team's counter row, so a decision cannot land between the check and the insert.
4. If `conflictsWith` is non-empty, Loop saves nothing and records a content-free "conflict reported" event (team, time, caller). If the call also sets `fileAnyway: true`, the output is saved with a conflict flag naming those decisions.
5. A flag is never cleared by an edit alone. Correcting the output re-runs steps 2 to 4. When a named decision is superseded, the flag changes to "needs re-check" and stays visible until the output is corrected or re-filed with a current version.

Limits stated plainly:

- The version proves the decisions were delivered, not that they were compared. An assistant can send an empty list out of habit.
- The assistant usually has the summary it wrote, not the file. A conflict is caught when the summary or the conversation contains the contradicting fact.
- So expect misses. The check will catch conflicts that are visible in the conversation at filing time, and little else. The done-when measure of one caught conflict is a floor, not evidence of coverage.

The founder accepted this on November 9 on the condition that conflicting and simultaneous writes are handled soundly. D16 is that handling: a missed conflict is still never a lost or overwritten record, and any later reader can flag it (`conflictsWithOutputs`, or re-filing).

### D6. Loop is the index, not the file store

An output is a pointer: URL, title, summary. Loop never fetches the URL, so it cannot confirm the link works or that teammates can open it.

The link field is the main abuse surface, so it is constrained:

- `https` only, at most 500 characters, default port, no userinfo (`user@host`). The host is a DNS name with a dot: not an IP address, not a bare name such as `localhost`, not a punycode (`xn--`) name. The path is URL-safe ASCII; Loop stores the normalised form.
- Known limit: some Teams and SharePoint "copy link" URLs are longer than 500 characters and will be refused. The member can use the shorter share link.
- Any host that passes those rules is accepted. Founder decision, November 9: when a member's own authorized assistant passes a link, judging the destination is not Loop's role.
- Loop keeps one built-in list of well-known document hosts (Google Drive and Docs, OneDrive, SharePoint and Office, Dropbox, Box, Notion, Figma, Canva, Miro, Airtable, GitHub, GitLab, Overleaf, Loom, YouTube, Zoom), meant to be broad. It is used only for labelling. A link to any other host is saved and shown as "unrecognised host" in text results and on the site, so the reader, not Loop, decides whether to open it.
- An owner or organizer can withdraw any output (existing rule), which removes the link.
- Still open, for the later discussion the founder asked for: whether a team may opt into a strict mode that rejects unrecognised hosts. Not built in this slice.
- Text results show the host next to the title, and the URL alone on its own line.
- Withdrawing an output removes its URL and text from every stored version.

Note for members: a "anyone with the link" URL is a credential. Filing it shares it with every teammate's assistant.

Reference material that an owner uploaded through the existing workspace stays readable: the team toolset keeps `search_knowledge` and `read_document`, and `team_brief` lists uploaded resources by title. The upload flow gets no new work.

### D7. Tags on records

A record may carry up to 5 tags of people in the same team. A tag puts the record under that person's mentions in `whats_new`. It sends nothing. Tags are stored as person IDs. Tool results show a tagged or authoring person by their handle, or as "a teammate" if they have none; person IDs are not returned to assistants. A person can remove a tag on themselves from the site. Events are not tagged onto records; a record belongs to at most one event (D12).

### D8. What is new

Every record change gets a number from a per-team sequence, assigned inside the write transaction. `whats_new` takes an opaque `cursor` and returns changes after it, oldest first, at most 30, with the next cursor. With no cursor it returns the last 7 days and says so. Mentions are ordinary entries in the same sequence, marked as mentioning the caller, so they are bounded by the same cursor. A `since` date is accepted for convenience and converted to the nearest cursor; the cursor is authoritative. This avoids clock skew and the gap between insert time and commit time.

### D9. Brief and state

One scope rule: decisions, the conflict check and topic keys are team-wide. Outputs and claims may belong to one event.

- `team_brief`: the curated brief including the deadline, current announcements (at most 5, each until withdrawn), uploaded resource titles, and counts of open claims and current outputs.
- `team_state`: the deadline line from the brief; open claims with owner and due date (past-due marked by date in the team's timezone); current outputs; current decisions; conflict flags. Asked for a team, it covers the whole team with each item's event noted. Asked for an event, it covers that event's outputs and claims plus the team-wide decisions. Each list is capped at 30 with "N more".
- "Current output" means not withdrawn and not replaced. `file_output` may name an output it replaces (`replaces: #4`), written by any member; the old one leaves the current list and stays in history.

### D10. Plain text first

Every tool in the team toolset, including tag tools and every error, returns a text form and a structured form carrying the same references. The text form must be sufficient alone, because some clients show the model only the text and a member may paste it into WhatsApp.

Testable format rules:

- no `{`, no UUIDs, no `|`, no `#` headings, no `**`;
- records are referred to by number (`#12`) and decisions also by topic key, and those references are accepted as input;
- each line at most 200 characters; a whole result at most 3,500 characters, ending "N more" when cut;
- a URL stands alone on its line;
- member-written text is single-line, with control, bidirectional and zero-width characters stripped at save, WhatsApp markers (`*`, `_`, `~`, backticks) stripped at render, and always rendered after a fixed quote prefix, so it cannot forge a line of Loop's own output.

### D11. A separate team endpoint

The team toolset is served at its own route, `/api/mcp/team`, not chosen by an environment variable, so one deployment can serve both. It registers: the six team tools, `amend_record`, `resolve_tag`, `list_tags`, `search_knowledge` and `read_document`. The existing `/api/mcp` and JSON endpoints are unchanged.

Team tools take a `team` handle. If it is omitted: for reads, the assistant's single consented team is used, or the list is returned if there are several. For writes, the handle may be omitted only if the member belongs to exactly one team; otherwise nothing is saved and the list is returned.

Retries: tools accept an optional `operationId`. Without one, Loop treats an identical write by the same person and assistant to the same team within 10 minutes as a retry and returns the original result.

### D12. Events are labels under a team

An event (an assignment, a meeting, a trip) is a named row under a team, created by an owner or organizer on the site. It is not a nested group. This replaces the first draft, which made events child groups and needed consent to inherit downward, contradicting an existing tested rule ("a parent lease is not inherited").

- Access is always decided at the team. Consent for the team covers its events with no change to lease matching.
- An event can be renamed or archived. Existing group addresses stay immutable as today.
- Handles, event slugs and group slugs share one namespace per team: saving any of them is rejected if another uses the name, so `@team/x` never resolves to two kinds.
- The resolver reports nested addressed groups (the cohort's trip groups) as teams with their own consent, as it does today.

`lib/emba/tags.ts` currently reports nested groups as events and has no collision check. Task 1.4 changes both.

### D13. Leaving and deletion

Hooked into the existing `revokeMembership` and account deletion:

- the person's open claims are released, and claims proposed for them are declined;
- tags on them are removed;
- their handle is deleted, freeing the name;
- records they wrote stay with the team and keep their author link, which is the existing shared-note policy (asserted by the current privacy test). After account deletion the author shows as "a former teammate".

Export is unchanged in policy: it lists the person's write receipts, plus their claims and handle. It does not include record text, as today.

Followers (an existing read-only role) can read team records and cannot write, matching current role rules.

### D14. Caps

Per person and assistant: 30 writes per hour per team. Per team: 100 open claims, 300 current outputs, 200 current decisions. Field limits: title 120 characters, summary 600, statement 400, claim text 200, topic key 2 to 48 slug characters, brief 4,000, announcement 600. A capped call returns a plain explanation and saves nothing. A test asserts the cap holds for writes made right after reading a record that contains instruction-like text.

### D15. Consent lifetime

A team grant lasts 30 days, like existing read grants. The existing renewal accepts only read-only grants; it is extended to renew read-and-write team grants. `team_brief` warns in its text when the calling assistant's grant expires within 5 days.

### D16. Many assistants writing at once

The founder asked how five assistants writing to one team at the same moment stay correct. The rules:

1. **One writer at a time per team.** Each team has one state row holding its record-number counter, decision counter and change sequence. Every write transaction locks that row first (`select … for update`) and holds it to commit. Writes to one team therefore happen one after another; different teams never wait on each other. At this scale a write holds the lock for milliseconds.
2. **Order is assigned under the lock.** Record numbers and change numbers are taken from the state row, not from a database sequence, so number order equals commit order and a `whats_new` cursor can never skip a change that commits late.
3. **Every change says what it expects.** Superseding names the decision it replaces; a correction names the version it edits; an output save carries the decisions version; confirming a claim requires it to still be proposed. If the expectation is stale, nothing is saved and the current state is returned so the assistant can decide again. No write silently overwrites another.
4. **The database is the last line.** One current decision per topic, one record number per team, one handle per name, valid statuses and foreign keys are constraints in the schema. A service bug then fails loudly; it cannot store a contradictory state.
5. **Retries are safe.** The operation ID and the identical-write window (D11) are checked under the same lock, so two simultaneous copies of one call create one record and both receive it.
6. **History is append-only.** A change adds a version and a change entry. Only withdrawal removes content, and it leaves the entry that says a record was withdrawn, by whom and when.
7. **Disagreement is kept, not resolved by Loop.** Loop does not pick a winner between two members' statements. Conflict flags, needs-re-check, overlap marks, proposed claims and reported-conflict events keep both sides visible with their authors until a person settles it.
8. **Reads are consistent.** `team_state`, `team_brief` and `whats_new` each read from one snapshot, so no result shows half of a write.
9. **Waiting is bounded.** A write waits at most 2 seconds for the lock. After that it saves nothing and says to try again. Caps (D14) are checked under the lock, so simultaneous writers cannot exceed them together.
10. **One lock order.** A write locks the acting person first, then the team's state row. Account deletion and member removal already lock the person first, so the two cannot deadlock each other.
11. **Least authority.** Access and consent are re-checked inside the write transaction, not only before it, so a grant revoked a moment earlier cannot be used. Audit rows record who, which assistant, what kind and which record number, and no record text.

Testing: the stale-expectation and constraint paths are tested in the normal suite. True parallelism needs several database connections, which the in-process test database may not provide; task 2.12 checks that first, and the five-writer test runs wherever real parallel connections exist, at latest in the rehearsal (5.1).

## How this is built

The founder set the priority on November 9: quality over cost.

- **Model.** Every section is built with the most capable model available in the session (Claude Fable 5.2 at the time of writing). No section is handed to a smaller model to save cost, including the site pages and the housekeeping.
- **Order.** Sections are built in the order of `tasks.md`. A section's tests, types and lint pass before the next section starts.
- **Test first.** Each task in sections 1 to 3 starts with a failing test for its spec scenarios. A denial rule (wrong role, no consent, wrong kind, capped) has its own test.
- **Independent review at each gate.** After each of sections 1, 2, 3 and 4, and after tasks 2.1 and 2.2 on their own, a reviewer with a fresh context reads the diff and the spec and looks for ways to break it. The reviewer is given the code and the requirements, not the builder's conclusions. It is told that part of the tree is untracked, so it must search the working files and not rely on `git grep`.
- **Findings are checked, then closed.** Each finding is verified against the code before it is acted on. Blockers and majors are fixed, with a test, before the next section starts. A finding judged wrong is recorded with the reason. Each gate adds a row to the review record below.
- **Stop conditions.** Work stops and the founder is asked when a fix would change a requirement in the specs, when a gate needs the hosted database or the Clerk Dashboard, or when a review finds the same class of defect twice.

## Where the rest went

| Item | Disposition |
|---|---|
| Personal wants and intents, `plan_for_me`, signed announcements, embeddings | Frozen in `loop-emba-intent-platform`. Not on the team endpoint. |
| Decision promotion by an organizer, source dependency graph, transitive invalidation | Dropped with `loop-portable-group-memory`. |
| Portal review bridge for shared notes | Kept for `/api/mcp`; not used by team records. |
| Quorum formation, "in if 3 others are", formed-met-kept log | Cohort tier. This slice creates no groups on its own. |
| Count-only visibility, aggregates, crisis routing | Cohort and section tiers. See rule 5. |

## Additions the brief did not ask for

Stated so the founder can cut them: `amend_record` (needed for withdrawal, which D1 depends on); brief history; the team timezone; the unrecognised-host label; write caps; the separate endpoint; the proposed state and overlap mark on claims. Tasks in section 6 reconcile the other open changes, which the founder asked for on November 9; they are housekeeping and carry no requirements.

## Founder answers, November 9

1. Claims: no gate on who assigns; rely on the trail and make discrepancies reconcilable. Recorded in D4.
2. Links: Loop does not judge a host its member's assistant passed; keep a broad known list. Recorded in D6. One item left for later discussion: an optional strict mode per team.
3. Conflict check: the miss rate is acceptable, provided simultaneous and conflicting writes are handled soundly. Recorded in D5 and D16.

## Review record

An independent reviewer read this change and the code beneath it on 2026-11-09 and reported 28 findings. Two were wrong (member removal and the handle form both exist; the reviewer's search skipped untracked files). The rest changed this design:

| Finding | Change |
|---|---|
| Team consent could not resolve handles; events needed lease inheritance | D12 rewritten: events are labels, access at the team |
| New OAuth scopes had no owner | D1: reuse existing actions, no new scopes |
| New kinds leaked through note tools | D2: first a `kind` filter, then replaced by separate tables so the leak is impossible by construction; test kept |
| Text form dropped the references tools need; member text could forge lines | D10: record numbers, single-line quoted text |
| Deletion and export claims did not match the code | D13 rewritten to the existing policy |
| Handle could shadow an event | D12: one namespace |
| Conflict flag could be cleared by an edit; check ran one way | D5 steps 4 and 5; D3 `conflictsWithOutputs` |
| Token semantics and race undefined | D5 steps 1 to 3 |
| Done-when not measurable | Outcome; D5 step 4 |
| `team_state` would misreport | D9: replaces, closes-claim, deadline, roll-up, caps |
| Decisions lacked compare-and-swap | D3 |
| No barrier to floods or injected writes | D14, D1 |
| Link field open to phishing and exfiltration | D6 URL rules; the allowed-list part was replaced by the founder with an unrecognised-host label |
| Withdrawal left content in history | D6, records spec |
| `whats_new` semantics | D8 |
| Team-versus-event scope | D9, D3 |
| Single-team default defined three ways | D11 |
| Uploads unreachable; toolset switch server-wide | D6, D11 |
| Claims departed from the brief | D4, later settled by the founder: anyone may record a claim; one for another person is proposed until confirmed |
| Plain text untestable; limits missing; retries; tags; grant lifetime | D10, D14, D11, D7, D15 |

### Gate 1.5: addressing (2026-11-10)

An independent reviewer read the addressing code, migration and tests against the addressing spec and ran its own experiments. No blockers, three majors, eight minors. Every finding was checked against the code.

| Finding | Outcome |
|---|---|
| Major: a handle or event slug equal to the team's own name made `@team` ambiguous | Fixed. The team name is held in the name registry; test added. |
| Major: exact resolution failed past 50 groups | Fixed. `resolve_tag` now looks the name up directly and then authorizes each match, so it has no listing limit; test with 57 teams added. |
| Major: the events service has no site page | Not a defect of this section. Scheduled as task 4.2. |
| Minor: a member can learn that a name is taken somewhere in the organization, including in a team they cannot read | Accepted. It follows from one namespace per team; it is site-only, reveals no kind or team, and assistants cannot reach it. |
| Minor: a member with a role only on a nested team can tag nobody | Accepted. People belong to the whole team; reading them needs access to the root team, which is the tested consent rule. |
| Minor: event names accepted line separators, invisible fillers and stacked marks | Fixed. One shared cleaner (`team-text.ts`) for all later record text; database check widened; tests added. |
| Minor: registry drift on truncate or organization change; no unique index on active event slugs | Fixed, with tests. |
| Minor: an event on a retired team could still be renamed | Fixed: archive only. |
| Minor: event row locked before authorization; lock order differed from account deletion | Fixed: authorize first, person lock first. |
| Minor: the backfill aborts if a hosted handle equals a group slug or team name | Accepted. The handle table has never been applied to the hosted database, so it is empty there. The founder should apply both addressing migrations together. |
| Minor: export does not include the handle | Scheduled as task 2.11. |
| Suspicion: crowd words such as `everyone` could be claimed as handles | Fixed: a short reserved list for handles and event slugs. |
| Suspicion: an archived event's slug is reusable | Accepted. Records will refer to events by id, never by slug text (constraint on section 2). |
| Test gaps: deletion, nested versus root consent both ways, expiry, identity-header coverage | Tests added. "A tag as input to any tool" is tested with the tools in section 3. |

### Gate 2.2a: records migration (2026-11-10)

An independent reviewer read the migration and its tests against the team-records spec and ran about 120 probes. No blockers, eight majors. Every finding was checked. The migration was rewritten before any service was built on it.

| Finding | Outcome |
|---|---|
| Major: a withdrawn record could keep its text and link | Fixed. A commit-time check ties the record's state to every version; test added. |
| Major: decisions and stored versions could be edited in place | Fixed. Stored versions accept only emptying on withdrawal; a record's team, number, kind, topic and event never change; counters only move forward. |
| Major: superseding needed a false intermediate state | Fixed. The successor links are deferred, so "mark the old one, insert the new one" works directly. |
| Major: change and receipt rows were not tied to the record's team | Fixed with composite keys; a receipt must point at a real change. |
| Major: account deletion and removal leave team data in place | Expected at this stage; it is task 2.11. The schema permits every step. Proposed claims for a departed person are now specified as declined. |
| Major: the one-line floor missed some invisible characters and blank text | Fixed. The check names code points explicitly, so it no longer depends on the database locale. Assistant names are limited to printable ASCII. |
| Major (test): the Data API test passed without the revoke | Fixed. The test builds a database with Supabase's default grants and checks every privilege. |
| Major (test): the last isolation assertion was vacuous | Fixed. |
| Minor: links to IP addresses, `localhost`, punycode names and unsafe path characters were accepted | Fixed in the schema and written into D6. |
| Minor: links without a slash before the query, and non-ASCII paths, are refused | By design. The service stores the normalised URL. |
| Minor: links over 500 characters (some Teams links) are refused | Kept; it is the specified limit. Listed as a known limit for the founder. |
| Minor: kind-specific shapes and limits, tag cap, same-topic and no-cycle supersede were service-only | Now enforced at commit. |
| Minor: a time zone name is checked for syntax only | Kept. The service validates the zone and computes dates outside SQL. |
| Minor: no state row for existing teams | By design: created on first write, in UTC until an owner sets the zone. |
| Minor: conflict reports had no retry key and did not count toward the cap | Fixed: a digest column; the cap counts reports. |
| Minor: a change row could not say who or what it concerns | Fixed: subject and other-record columns; an overlap action. |
| Suspicion: a topic with a withdrawn successor becomes unusable | Resolved in D3: the topic is free again. |
| Suspicion: lock order between deletion and team writes | Resolved in D16: person first, then team. |
| Not done: flags on withdrawn records, filing to an archived event, tagging a non-member | Service rules, tested with the services in tasks 2.4 to 2.8. |

### Gate 2.13: record services (2026-11-10)

An independent reviewer read the services, hooks and tests against the team-records spec and ran probes. No blockers, five majors, sixteen minors and nits. Every finding was checked against the code before it was acted on.

| Finding | Outcome |
|---|---|
| Major: two writers who name each other (a claim proposed for a teammate, a tag) could deadlock | Fixed. A write locks its own person row in a mode that does not block references, then every other person it names, then the team. A deadlock or serialization stop that still occurs returns "busy, retry" with nothing saved. A multi-writer test covers it; it runs only against a real Postgres (rehearsal 5.1). |
| Major: the same cycle against member removal and account deletion; a claim committed during a removal could be missed | Fixed. Removal and role changes commit first, then release what the person held in a second transaction that sees every earlier write. Deletion already waits for, or blocks, any write naming the person. |
| Major: a declined write returns team records (current decisions, the record as it stands) under write consent alone, unaudited | Fixed. Every team write now needs read consent as well as write consent, and a declined write is audited as a read. The site only offers "read" or "read and write", so no grant changes. |
| Major: some inputs reached the database and came back as raw errors quoting the row | Fixed. The text cleaner removes everything the storage rules refuse (unassigned, private-use and filler characters); dates outside 2000 to 2199 are invalid; an assistant name that is not plain printable text cannot write; any remaining storage refusal becomes a plain invalid-input error. |
| Major: removing someone from one team (role removed, or changed to follower) released nothing | Fixed. The same release runs after any role change, for every team the person can no longer write to. A person no longer on the team is shown without a handle. |
| Minor: a correction that still reported a conflict could drop an earlier flag | Fixed. A flag goes only when the correction reports no conflict, or when its decision is no longer current. |
| Minor: a withdrawn decision's topic key was still returned | Fixed in every view. The key itself stays stored (a slug of letters, digits and hyphens), because a record's identity is not edited. |
| Minor: replacing an output was limited to its author or an organizer | Changed to match D9: any member with write access may file the output that replaces another. |
| Minor: an organizer's assistant could withdraw other people's records and announcements | Fixed. An organizer's authority over others' records applies on the site only. |
| Minor: the owner link stayed on a deleted person's closed claims | Fixed: removed on deletion. The author link is kept on purpose (D13). |
| Minor: repeated identical conflict reports wrote an audit row each; one decision named twice counted twice | Fixed. |
| Minor: a link over 2,000 characters threw instead of being named as too long | Fixed. |
| Minor: results show people as `@team/ana` but inputs took only `ana` | Handled at the tool layer, which accepts `@team/ana`, `@ana` and `ana`. |
| Minor: claims cannot be corrected, only withdrawn and recorded again | Accepted for this release. The spec is read as: outputs can be corrected; any record can be withdrawn. Founder may reopen. |
| Minor: a removed member cannot withdraw their own records; nobody can on a retired team | Accepted. An owner or organizer can, on the site. |
| Minor: an unknown tag is reported without near matches | Accepted. Handles are unique, so there is never more than one candidate; the text points to `list_tags`. |
| Minor: an identical write inside ten minutes is treated as a retry | By design (D11), now only while nothing has happened to that record since. The result says it was a repeat. |
| Nit: the "recognised host" label covered redirectors and user-hosted pages | Fixed. Short-link and user-content hosts were removed from the list. |
| Nit: characters that are legal in a URL but awkward in markdown | Accepted. A link always stands alone on its line (D10). |
| Nit: private-use and filler characters were stored | Fixed with the cleaner change above. |
| Not proven locally: simultaneous writers, simultaneous retries, caps under contention, the lock wait | The test database has one connection. Six multi-writer tests are written and run only against a real Postgres; they are part of rehearsal 5.1 and must pass before the hosted gate. |

### Section 3 build notes (2026-11-10)

Decisions taken while building the tools, each within the design above. They are listed so the founder can reopen any of them.

- **A link is the one line that may exceed 200 characters.** A stored link can be 500 characters and cannot be wrapped. It stands alone on its line; every other line obeys the limit. The spec's format rule says so.
- **The text form of the conflict check is bounded.** A result is at most 3,500 characters, which holds roughly 10 to 30 decisions. Beyond that the text lists as many as fit and counts the rest; the structured form carries all of them. For a team with more current decisions than fit, an assistant that sees only text compares against a partial list. This is a stated limit of D5, not a guarantee.
- **Resources are read by title on the team route.** `read_document` takes the exact title shown by `team_brief`, and a part number for long resources, so no internal identifier appears in text. If two resources share a title, Loop does not pick one.
- **Member text is defanged when shown.** Inside quoted lines, chat formatting characters are removed, braces become parentheses, and any link written in member text is replaced by "(link omitted)". The only link in a result is the one Loop stored for an output.
- **Wrong argument types are reported by the protocol library** in plain words before a tool runs. Every other error and refusal uses Loop's own fixed sentences.
- **Writes need read consent as well** (gate 2.13). The site offers "read" or "read and write".
- **The brief is not an entry in `whats_new`.** Assistants receive the current brief from `team_brief`; its saved versions are visible to owners and organizers on the site.
- **Open for the hosted gate:** the team route shares the sign-in audience of the existing route. Some assistants compare the address they connect to with the advertised resource. Task 5.5 must confirm a real assistant connects to `/api/mcp/team`; if one refuses, the fix is a route-specific resource document, not a change to the tools.

### Gate 3.9: team tools (2026-11-10)

Independent review of the assistant tool surface. No blocker, and no identity, consent or cross-team bypass found. Findings were checked against the code before any change.

| Finding | Outcome |
|---|---|
| Member text could print a live link or an id by splitting it with characters that are removed afterwards | Fixed: characters are removed before links and ids are replaced. Tested. |
| A list the service had already cut closed the text to every later section (brief body, claims, outputs) | Fixed: a cut list adds to the count only. The brief body now comes first in `team_brief`. Tested. |
| `whats_new` text showed fewer changes than its cursor covered, so a text-only assistant lost changes | Fixed: each change carries its own cursor and the text's cursor is that of the last change shown. Tested by reading 60 changes as text only. |
| Loop's closing lines, including the note that quoted lines are data, were dropped when a result was cut | Fixed: 600 characters are kept for closing lines, so only items are cut. Tested. |
| An unknown `amend_record` action returned the library's wording, with a "\|" in it | Fixed: validated by Loop, answered with the fixed sentence. Tested. |
| A long event name could wrap so that an organizer's words started a line | Fixed: the name is a quoted line of its own. |
| An all-digit topic key was read as a record number | Fixed: a topic key needs a letter. Tested. |
| A proposed claim could lose its "recorded by" when neither person has a handle | Fixed. |
| A correction silently dropped tags, `replaces` and `closesClaim` | Fixed: refused as an invalid request. Tested. |
| An assistant whose client id is a web address was printed as "(link omitted)" | Fixed: shown by name (Claude) or host. |
| A stored link may contain "**" or an id | Accepted: the link line is the member's link as stored and stands alone; the format rules exempt it. Many real document links contain ids. |
| The event part of a handle is ignored by `whats_new`, `log_decision` and `amend_record` | Accepted: decisions and the change list are team-wide. |
| A future cursor is accepted; bare domains and @words are not defanged; `read_document` reaches the newest 100 resources; a 200-character host can wrap | Accepted for the first team. Listed for the hosted gate review. |

Scenarios still without a test at the tool level: a write with no team named when the person has exactly one team; a read-only grant refused on each write tool (covered at service level); `read_document` with duplicate titles.

### Gate 4.6: team page and connections (2026-11-10)

Independent review of the site side. No blocker and no authorization gap: every action was probed with another team's ids, as a member, a removed member and an outsider, and all were refused with the same sentence.

| Finding | Outcome |
|---|---|
| A refused brief save reset the form and lost what the organizer typed | Fixed: the brief editor holds its fields in state. Tested. |
| Real timezone names (Asia/Kolkata, US/Eastern, any letter case) were refused | Fixed: any name the runtime knows is accepted and stored in its usual spelling; bare offsets are refused. Tested. |
| Every brief failure read "check your access" | Fixed: an invalid value and a concurrent edit each have their own sentence. Values are checked before access and a conflict is reported only to someone allowed to edit, so neither tells an outsider anything. Tested. |
| A declined save showed the assistant's wording, cut mid-sentence | Fixed: site wording for a changed or missing record. Tested. |
| The consent wording understated both grants | Fixed: read names announcements, resource text and handles; write names correct, withdraw, claim answers, replacing a teammate's output and tagging. The spec's sentence is unchanged. |
| Renewal did not check that the assistant is still admitted | Fixed in the action; the page no longer offers it. Tested. |
| Choosing Read left an earlier read-and-write grant active | Fixed: a new grant for the same assistant and team replaces the earlier one. Tested. |
| Setup copy named "the MCP URL" beside two addresses and omitted the write scope | Fixed. |
| Any failure reading the brief history showed an organizer the member view | Fixed: only a refusal means "not a manager". |
| Conflict flags were live regions; a raw client id was printed | Fixed. |
| An empty brief saves as a new blank version | Kept as the way to clear a brief; the editor now says so. |
| Buttons of the same name on every record; a second Withdraw under "Your recent saves" | Accepted for now. Raise with the founder under "one meaning per surface". |
| `revalidatePath('/groups')` refreshes the team page only through current framework behaviour | Accepted; the browser pass (5.2) checks that the version field refreshes after a save. |

### Gate 5.3a: whole change (2026-11-10)

Final independent review of the whole change. No blocker. One major, fixed.

| Finding | Outcome |
|---|---|
| A withdrawn claim stayed open or proposed, so its owner link survived the owner's account deletion | Fixed: withdrawing a claim also lets it go (released, or declined if it was only proposed). Tested through deletion. |
| The release of claims and tags after a role or membership change runs after that change is saved, and one failure left it undone for good | Fixed in part: it retries twice when the team is busy. A third failure still surfaces as an error after the change is saved; the remaining links are removed at account deletion. |
| The migrations could queue behind a long transaction on shared tables | Fixed: each sets a 5 second lock timeout and resets it. They are not idempotent; a rerun fails on the first `create table`. |
| `1drv.ms` (a short-link host) was still labelled as recognised | Fixed. |
| Status line and timezone default in this document were out of date | Fixed. |
| A follower appears in `list_tags` but cannot be tagged on a team record | Accepted for the first team, which has no followers. The refusal says no current teammate has that handle. Fix before the cohort. |
| Withdrawing an output that replaced another leaves the team with no current output for it | Accepted: the earlier one stays replaced. A product question for the founder. |
| Write tools are marked idempotent, but an identical call after 10 minutes without an operation id saves a second record | Accepted: the tool descriptions tell assistants to send an operation id to retry. |

**Order for the hosted gate.** (1) Confirm `20261108000000_emba_resource_workspaces.sql` is applied; it belongs to another change and the `/groups` pages need it. (2) Apply the four team migrations in date order before deploying this code: account deletion, export and every role change now read the new tables and fail without them. (3) Add the `group-memory:write` scope in Clerk before deploying: the sign-in metadata now advertises it, and an assistant that asks for every advertised scope would fail to sign in otherwise. (4) The earlier `/api/mcp` route gained `resolve_tag` and `list_tags`, answers a conflict with 409 where it answered 503, and an existing read grant for a team now also reads that team's records and handles. No such grant exists on the hosted project yet.

## Why

On November 9 the product direction narrowed: Loop is a layer between each member's own assistant and a group they belong to. The first users are a team of about five doing a group assignment, each in a different assistant. Their job: get the team's work to add up without one person chasing everyone. The existing code has identity, membership, assistant consent, shared notes and `@` tagging, but no record of who owns what, where the current files are, or what the team decided.

## What Changes

- Add team records in their own tables, beside the existing shared-note store and invisible to its tools: filed outputs (a link plus a summary), decisions (a new one on the same topic supersedes the old one), and claims (an owner and a due date; a claim recorded for someone else is proposed until that person confirms it).
- Add a separate team endpoint, `/api/mcp/team`, with eleven tools: six new team tools (`team_brief`, `team_state`, `file_output`, `log_decision`, `claim`, `whats_new`), `amend_record` for corrections and withdrawal, and four existing ones (`resolve_tag`, `list_tags`, `search_knowledge`, `read_document`). The existing `/api/mcp` route is unchanged. Every result carries a plain-text form that reads correctly when pasted into WhatsApp.
- No new sign-in scopes: reads use the existing `plan:read` and writes the existing `group-memory:write`.
- Add a conflict check: an output cannot be filed until the calling assistant has compared it with the team's current decisions and reported any it contradicts. A reported conflict is stored and shown to the team. Loop runs no model, so this check will miss conflicts the assistant cannot see; design.md states the limit.
- Serialise writes per team so several assistants writing at once cannot lose or overwrite each other's records; a stale write saves nothing and returns the current state.
- Accept a filed link to any https host, and label hosts outside a built-in list of well-known document services as unrecognised. Loop never fetches a link.
- Let records carry `@` tags. A tagged person sees the record under "mentions you" the next time their assistant asks what is new. Nothing is sent to them.
- Let owners and organizers curate the team on the site: the brief (the assignment, the deadline, key links), events, and announcements. Events are named labels under a team, not nested groups; access is decided at the team.
- **BREAKING for the group-memory flow:** team records are saved in one call when the member asks. The prepare, approve-in-portal, execute sequence is no longer used for team records. It remains for the frozen cohort features (commitments, name disclosure).
- **Supersedes `loop-portable-group-memory`.** What that change built (handles, shared notes, exact-group consent) is kept. Its decision design is replaced by the simpler one here; its dependency graph and portal review bridge are dropped.
- Not in this change: personal wants and intents, signed announcements, embeddings, uploads beyond what `loop-resource-workspaces` already built, quorum formation, aggregates for non-members, count-only visibility. See design.md for where each went.

## Capabilities

### New Capabilities

- `team-records`: outputs, decisions and claims; who may write, correct and withdraw them; superseding; conflict flags; tags on records; write caps; per-team serialisation of concurrent writes.
- `team-tools`: the team endpoint and its eleven tools, the save-on-ask contract, plain-text results, human references such as `#12`, and consent lifetime.
- `addressing`: `@` handles for teams, events and people; resolution, listing and the opt-in person handle. (A first version of resolution and listing is implemented; this change revises it so events are labels and one namespace covers handles, event slugs and group slugs.)
- `team-curation`: the brief, events and announcements that owners and organizers maintain on the site; the team page where members see and control records; the per-assistant consent choice.

### Modified Capabilities

None of the capabilities in `openspec/specs/` change.

## Impact

Root Next.js application: `lib/emba` services, additive PostgreSQL migrations, `lib/emba/mcp.ts`, a new `/api/mcp/team` route, and the `/groups` pages. Reuses `access`, `consent`, `groups`, `group-memory`, `tags` and the Clerk identity adapter. No new provider, no model call on Loop's side, no file storage, no outbound messages. Depends on the hosted gate in `loop-resource-workspaces` (tasks 5.1 to 5.3) before any real team can use it.

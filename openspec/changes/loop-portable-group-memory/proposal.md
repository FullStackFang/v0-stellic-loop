## Why

Members should be able to address a cohort such as `@emba2027` from their preferred assistant, remember an approved group decision in Claude, and retrieve or correct that same decision in ChatGPT. The existing pilot supplies authorization, personal memory and coordination, but lacks portable group handles, conversational capture and a versioned shared-memory service.

## What Changes

- Add namespaced group handles over existing stable loop IDs, resolved only within the caller's current membership and client grants.
- Add bounded, source-linked shared notes, proposals, questions and organizer-attested decisions, with explicit publication, immutable corrections and withdrawal.
- Accept assistant-produced structured memory candidates without ingesting whole conversations; route personal candidates through existing personal review and group candidates through explicit shared-publication review.
- Add group-only context retrieval distinct from private `plan_for_me`, plus supported MCP tools for discovery, review preparation, approved execution and retrieval.
- Demonstrate a real Claude-to-ChatGPT save/recall/correct/revoke journey against one authoritative database, with separate client consent.
- Keep the portal for trusted review, membership and lifecycle controls. Do not build a new chat application or promise universal native `@` autocomplete.

## Capabilities

### New Capabilities

- `addressable-groups`: Stable group addressing, authorized discovery and affiliation/authority distinctions.
- `shared-group-memory`: Published shared memory, attribution, decisions, corrections, dependencies and withdrawal.
- `reviewed-assistant-capture`: Bounded structured candidates, first-party review and exact authorized mutation execution.
- `portable-assistant-context`: Shared-only retrieval, host boundaries and cross-assistant acceptance.

### Modified Capabilities

None of the archived/main capabilities in `openspec/specs/` change. This additive change depends on the unarchived `loop-emba-intent-platform` foundation; it does not replace its specifications or mark its unfinished tasks complete. See design.md for the explicit integration contract.

## Impact

Root TypeScript services, PostgreSQL migrations, MCP/HTTP adapters and the existing portal review surfaces. Reuse `lib/emba/{access,consent,confirmation,memory-review,memory,knowledge,planning,mcp}.ts`; extend action/lease enums deliberately instead of broadening old grants. Add modules for group addressing and shared memory. No dependency on Living Brain is introduced. OAuth provider and actual host-account compatibility remain live-demo prerequisites; synthetic implementation can proceed independently. No deployment, external messaging or real-member enrollment is part of this specification-writing change.

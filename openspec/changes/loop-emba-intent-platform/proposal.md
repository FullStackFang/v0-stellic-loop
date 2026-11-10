## Why

The EMBA trip pilot needs member-owned preferences and trustworthy trip coordination across personal assistants and a usable portal. Existing link-based trip sharing and board commitments do not provide invite-only cohort access, delegated consent, persistent private wants or conditional participation.

## What Changes

- Add an invite-only, multi-country EMBA trip domain in the root TypeScript application, backed by one authoritative service layer for portal, HTTP and MCP.
- Add verified identity, hierarchical loop permissions, personal ownership, scoped agent leases and access audit before exposing private data.
- Add editable, versioned wants, time-boxed intents, safe compilation, contextual planning and explicit feedback.
- Add permission-filtered document retrieval, citations, processing state and signed announcements.
- Add activity-version commitments, a monotone resolver, transactional inbox delivery, withdrawals and explicit disclosure consent.
- Add member controls and organizer operations with small-cell suppression, export/deletion and no individual preference dashboard.
- **BREAKING for pilot-associated resources:** link possession, public sharing flags and legacy sessions without sufficient identity verification no longer confer access. Legacy routes must not bypass pilot authorization. Unrelated public boards keep their existing contract.
- Defer bookings, payments, capacity allocation, arbitrary analytics, sensitive clustering, proactive third-party notifications and a second backend runtime.

## Capabilities

### New Capabilities

- `emba-access`: verified identity, invitations, tenant isolation, loop roles and legacy-route boundaries.
- `emba-agent-access`: OAuth MCP, lease consent, audit and caller-scoped updates.
- `emba-personal-memory`: typed wants/intents, correction lifecycle, contextual planning and feedback.
- `emba-trip-knowledge`: documents, citations, processing and signed announcements.
- `emba-coordination`: versioned activities, conditions, resolution, withdrawals and inbox delivery.
- `emba-privacy-lifecycle`: disclosure, aggregates, exports, deletion and data-retention gates.
- `emba-portal`: member and organizer workflows and pilot acceptance.

### Modified Capabilities

None globally. The existing board specifications continue to describe public-board behavior; the new `emba-access` contract governs all pilot-associated resources, including those reachable through existing routes. Migration must explicitly classify resources rather than reinterpret all boards as private loops. The older `loop-mvp` proposal for `web/` is not part of this change.

## Impact

Root Next.js routes/actions/components, server services, Postgres migrations, integration tests, document processing and a remote MCP adapter. Existing identity, event, trip and transaction patterns are candidates for reuse only after authorization review. The separate `web/` app and uninspected Python prototype are not authoritative runtimes for this change. Provider selection, exact retention durations and organizer signing-key custody are recorded implementation/launch gates, not implied completed integrations. See `docs/loop-emba-mvp-hardening.md` for the review and source references.

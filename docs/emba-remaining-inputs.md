# EMBA remaining implementation inputs

This is the dependency map for `loop-emba-intent-platform`, not a release approval. The original task list remains authoritative. The separate portable-group-memory change has not been started.

## Inputs owned by the pilot operator

| Input | Why it blocks implementation | Tasks |
| --- | --- | --- |
| Sign-in/OAuth provider project and intended Claude/ChatGPT test accounts | The spec requires a real discovery, PKCE, resource-audience and verified-client compatibility spike before custom auth integration. Production portal sessions deliberately return unavailable. | 1.3, 2.3, 2.5, 3.6, 8.2, 8.3 |
| Approved raw-conversation processing terms | The original spec prohibits durable raw conversation content, including at providers. A model choice alone does not establish that boundary or crisis exclusion acceptance. Structured reviewed candidates remain available without raw chat ingestion. | 1.4, 6.3, 7.5 |
| Gateway credit/access availability | The synthetic live embedding request reached Gateway but returned HTTP 403 with a credit-related reason. Local integration can be verified without paid inference; live semantic-quality acceptance cannot. | Live embedding acceptance |
| Named pilot owner-verification operator and approved data policy | Exact audit/history/backup durations, retained publication authorship/prose/shared identity, and restored email-only invitation handling are not engineering defaults. The external deletion ledger and restore traffic barrier need an actual operating environment. | 7.1, 7.3, 7.4, 7.5 |

No secrets belong in a chat reply. Actual test-account names and access to complete account-specific login/consent are needed for host acceptance; credentials should be supplied through the selected service's secure configuration workflow. Routine architecture choices do not need another user decision.

## Engineering decisions made without more input

- Signing: service-held scoped Ed25519 keys through server Secret configuration, preserving the specified algorithm. Implementation and rotation/compromise procedure are in [signing custody](emba-signing-custody.md). Real keys still need real verified pilot scopes before provisioning.
- Workers: existing Vercel Node runtime, protected five-minute cron, durable bounded claims/retries and manual recovery. [Process-loss evidence](emba-worker-recovery.md) covers actual killed processes; hosted execution remains a deployment check.
- Vectors: optional pgvector schema and authorized exact cosine services, verified with deterministic test embeddings on actual PostgreSQL/pgvector. The [Gateway adapter](emba-embeddings.md), durable indexing, manual processing and explicit semantic MCP tool are implemented. The fixed model is `openai/text-embedding-3-small` at 1536 dimensions; live quality evaluation remains blocked by account access/credits. The feature defaults off.

## Independent audit of remaining local work

- Portal acceptance: actual components/actions and database behavior, keyboard/mobile layouts, role/lease revocation, stale reviews and legacy-route denial have local evidence. The synthetic browser harness does not exercise an authenticated Next Server Action request or a real host OAuth flow. Adding another test-only production login would not close those gaps.
- Privacy lifecycle: current personal records, operation receipts, confirmations, inbox entries and dependencies have deletion handling. Plan-history attribution is deidentified; published announcement authorship, publication prose and the shared legacy identity have documented exceptions. There are no private vector indexes or generated summaries to purge yet. Do not add speculative stores just to check off deletion.
- Retention/restore: expiry and physical cold-backup/tombstone replay have local evidence. Do not invent approved retention periods or add email-bearing tombstones before the policy decision.
- Knowledge/compiler: deterministic text/itinerary extraction, versioned keyword/vector indexing, Gateway integration and explicit structured Want review are implemented. Synthetic inference tests establish integration mechanics, not semantic quality or compliant raw-conversation processing.

## Next implementation order after input

1. Prove sign-in/OAuth compatibility with the selected provider and intended hosts; then wire verified portal sessions and run real request-level/mobile acceptance.
2. Provision scoped signing keys after real organization/operator setup and deploy the prepared worker; verify rotation, retries and recovery in that environment.
3. Resolve Gateway credit/access and evaluate live retrieval. Implement a conversation compiler only against an approved no-durable-raw-input boundary, including raw-text/crisis failure tests; extend deletion to any actual new derived stores.
4. Implement approved retention/restore policy and publish matching member-facing terms; complete remote read/revoke/confirmed-write acceptance before enrollment.

These streams can overlap once their decisions are supplied. A local test pass alone cannot approve production identity, privacy policy or third-party processing terms.

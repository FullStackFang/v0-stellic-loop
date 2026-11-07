## 1. Baseline and compatibility contract

- [ ] 1.1 Read root instructions, installed framework guides and the foundation/current-state artifacts; record actual baseline checks and preserve unfinished foundation gates.
- [ ] 1.2 Map existing access, lease, confirmation, personal review, source invalidation and privacy services to this design; record the additive schema/tool contracts and lock ordering before coding.

## 2. Addressable groups

- [ ] 2.1 Add namespace/address migrations and trusted root-owner registration with unique constraints and non-reusable retirement; test normalization, concurrent claims and no institutional/role inference on native PostgreSQL.
- [ ] 2.2 Implement bounded discovery/resolution over current membership plus exact-scoped plan leases; test ambiguity, hidden/unconsented handles, expired identity and cached-ID revocation.
- [ ] 2.3 Add the minimal first-party handle display/consent picker; verify users can grant access without an existing delegated lease and cannot see unauthorized groups.

## 3. Shared canonical memory

- [ ] 3.1 Add shared identity/version/operation/dependency tables with tenant constraints and API-role restrictions; test invalid cross-tenant references and bounded fields.
- [ ] 3.2 Implement member publication and organizer decision approval with explicit attribution; test follower denial, self-versus-organizer edits and no personal-memory promotion.
- [ ] 3.3 Implement versioned correction, explicit decision promotion and withdrawal; test stale concurrent correction, idempotency, denial of withdrawn historical content and manage-only decision withdrawal/demotion even by original authors.
- [ ] 3.4 Implement same-loop version dependencies, cycle rejection and transitive/depth budgets; verify member-submission versus verified-source provenance, budget boundary denial and inert source text/URLs.
- [ ] 3.5 Add transitive invalidation on document/shared-source correction, deletion and withdrawal; test dependency chains, stale in-flight reads and lock ordering on native PostgreSQL.

## 4. Reviewed assistant capture

- [ ] 4.1 Define strict personal/shared candidate schemas and prepare services with no candidate-body persistence; test unknown transcript fields, oversize input and content canaries in failures/logs/audits.
- [ ] 4.2 Extend lease/token/confirmation action schemas and SQL constraints for group-memory writes without upgrading old grants; test exact scope/client binding and existing action regressions.
- [ ] 4.3 Build authenticated personal-versus-shared review using existing portal forms, showing exact destination, audience, text, kind, sources, changes and trusted originating client identity/current consent; test forged client labels, revoked/unknown/wrong-scope clients, copy/paste bridge, keyboard/mobile and no sensitive URL payloads.
- [ ] 4.4 Implement first-party approval and atomic delegated execution with current role/source/version rechecks; test altered payloads, cross-client confirmation, expiry, demotion and revocation after review.
- [ ] 4.5 Add minimal authorized operation receipts for lost-response recovery; test concurrent exact retries, changed operation payload, revoked-client retries, retries after correction/invalidation/withdrawal without old content, and no regression to existing activity replay protections.

## 5. Portable context and adapters

- [ ] 5.1 Implement group-only search/read/context without calling personal-memory retrieval; verify private canaries, privacy-safe activities, exact-loop filtering, evidence limits and explicit truncation/conflict states.
- [ ] 5.2 Add final output/source-version checks and minimal audit/no-store behavior; test audit failure, source invalidation, removed membership and revoked lease during a read.
- [ ] 5.3 Expose the seven specified group MCP tools over the shared services and required HTTP/portal paths; test strict inputs, stable IDs, scope errors and adapter authorization parity.
- [ ] 5.4 Label private planning separately, document portable group-reference syntax and unsupported group delivery/representation; test that audience assertions and instruction-like content never expand authority.

## 6. Lifecycle and deterministic demo

- [ ] 6.1 Extend export/deletion/tombstone coverage for new receipts, dependencies and authorship without inventing the deferred retention policy; test withdrawal, author departure and isolated restore behavior.
- [ ] 6.2 Build a two-client synthetic scenario: resolve, prepare, first-party review, publish, cross-client recall/correction, stale denial, private isolation, nonmember denial and client-specific revocation.
- [ ] 6.3 Exercise actual review components/actions in the local browser harness and registered MCP tools against the same disposable database; record which transport/auth pieces are synthetic.
- [ ] 6.4 Run focused application/native tests, changed-file lint and types; if shipped code changed, stop competing dev servers and run one final production build.

## 7. Actual host integration and acceptance (existing external gates apply)

- [ ] 7.1 Complete the foundation auth-provider compatibility spike for the intended accounts: record actual host eligibility, discovery, PKCE, resource audience and client identity before adding provider-specific behavior.
- [ ] 7.2 Implement supported browser sign-in and verified account linking to one Loop person, with separate Claude/ChatGPT client consent; test identity spoofing, cross-account linking and absence of fixture auth in production.
- [ ] 7.3 Apply foundation/new migrations to an isolated demo database before deploying the authenticated demo; verify the linked project/preview, required environment and legacy boundary regression without using real-member data.
- [ ] 7.4 Demonstrate actual Claude publication after review, ChatGPT fresh recall/correction, Claude current reread, stale denial, unauthorized-user denial and independent revocation; record clients/date/results without credentials or sensitive content.
- [ ] 7.5 Update setup/demo/privacy runbooks and both change ledgers with exact evidence and remaining gates; do not mark raw compilation, vector retrieval, provider custody or enrollment policy complete through this narrower demo.

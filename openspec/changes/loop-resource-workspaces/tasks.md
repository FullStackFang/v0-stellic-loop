## 1. Baseline and implementation plan
- [x] 1.1 Review approved design, root/local instructions, installed Next.js guides and existing provider runbooks; run relevant baseline tests.
- [x] 1.2 Map existing group/document/invitation/consent tools and schema to the focused workspace flow; identify additive migrations and actual provider setup gaps.

## 2. Groups and access
- [x] 2.1 Implement pilot-owner group creation with transactional tenant/owner/address invariants and authorization tests.
- [x] 2.2 Build group list/detail, member roles/removal/leave, recipient invitation inbox/accept/decline and copy-link sharing over existing services.
- [x] 2.3 Implement opt-in unguessable access-request links, deduplicated request/review lifecycle and privacy tests.

## 3. Resources
- [x] 3.1 Add bounded text/Markdown/PDF ingestion with maintained extraction dependency and page/line metadata; test unsupported, empty, encrypted and oversized input.
- [x] 3.2 Reuse durable processing for automatic indexing, status/retry and versioned replacement/deletion; test termination/retry and stale-content exclusion.
- [x] 3.3 Build resource library, upload, status and permission-checked extracted-source viewer; test owner/member separation.

## 4. Assistant/API access
- [x] 4.1 Expose group resource search/read through the existing MCP registry and authenticated JSON endpoint with shared authorization/audit services.
- [x] 4.2 Build connection page with actual endpoint, host-specific instructions, explicit group read leases, expiry/renewal/revoke and truthful readiness states.
- [x] 4.3 Test citations, cross-tenant/nonmember denial, stale versions, lease expiry/revocation, audit failures and untrusted document payloads through both transports.

## 5. Verification and hosted pilot
- [ ] 5.1 Exercise actual browser flows; run relevant tests, lint/types and one final production build.
- [ ] 5.2 Complete existing provider configuration and isolated hosted migrations/deployment; preserve unresolved external gates.
- [ ] 5.3 Record actual Claude connect/read/update/revoke acceptance with independent accounts; record ChatGPT eligibility and actual result separately.
- [x] 5.4 Publish setup/API/limits/privacy runbook and reconcile real-member release prerequisites before enrolling the seven-person team.

# Reviewed announcement portal

The trip panel now exposes organizer publication, correction, and key-status review forms. Publication requires the first-party session, a checked review acknowledgement, current loop management authority, and a trusted server-resolved active signing key. Corrections bind the prior version and preserve immutable earlier versions; the panel displays up to ten versions per notice. Key retirement, revocation, and compromise show their consequences before submission and cannot reactivate a key.

`lib/emba/announcement-signer.ts` defaults to unavailable. Its request-local test fixture is enabled only when `NODE_ENV=test`; production fixture injection throws. No key material, signer implementation, or signing-key selection is accepted from the client. Existing service-side Ed25519 signing and verification remain the authority boundary. Production provider selection, key provisioning, custody, rotation policy, and recovery remain task 4.5 release gates. The current key schema has lifecycle status rather than an expiry timestamp; expired principals and retired/revoked/compromised keys are denied as applicable.

The extracted `app/emba/announcement-panel.tsx` reuses the existing form interaction and displays announcement bodies as React text. Private announcement/key metadata reads remain authorized and audited. Signature verification now holds a shared lock on key status through the read transaction, so a concurrent revocation cannot commit before a previously active status is returned.

Signed timestamps use PostgreSQL's clock, matching key registration and retirement timestamps even when the application host clock differs. After asynchronous source reads and signer resolution, the panel rechecks access, refreshes key status, removes organizer controls/metadata on demotion, and audits before output. Complete loss of access returns the unavailable state.

Tests exercise default unavailability, production fixture rejection, explicit review, publication and correction, stale revisions, expired/delegated principals, revoked roles/memberships/keys, wrong scope, immutable history, compromise warnings, access changes during signer resolution, and injected script/URL/form fields without fetching, executing, or changing authority. Native PostgreSQL tests verify independent-clock skew and that concurrent key revocation waits for verification reads.

Focused lint and TypeScript checks pass. No production build or deployment was run by this subtask.

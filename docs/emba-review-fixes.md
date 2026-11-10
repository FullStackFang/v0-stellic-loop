# EMBA review fixes

## Authorization and notifications

Inbox polling now authenticates the person, then requires an exact organization/loop `plan:read` lease for each returned event. Each event's audit row references the applicable lease. A global lease cannot expose loop events; a scoped lease works without a global lease. Revoked scoped leases deny polling.

Reopening an activity selects recipients from the previous revision's commitments but inserts the notification against the new revision. The current-event filters in polling and delivery therefore retain the reopening message. Commitments and name disclosure are not copied into the new revision.

## Transaction ordering

Authorization locks the person before identity rows. Services that update that person take `FOR UPDATE` before authorization: memory writes, feedback writes, confirmed-action consumption, and activity publication. This avoids concurrent shared-to-exclusive upgrades.

Loop authorization holds shared locks on hierarchy rows and the membership/role rows that grant access. Activity services first read the immutable scope, authorize the actor, and then lock the activity. This ordering also applies to disclosure and assistant action preparation. Manager authorization is completed before the activity lock. Withdrawal needs only personal authority and still takes that authority first. Lifecycle hooks retain their person/authority-before-activity ordering.

The lock order is person(s), identity/hierarchy/authority, activity, then activity-owned records. Multi-person role management acquires persons in sorted order; see the role-management service. The transaction helper has not gained automatic deadlock retries.

The follow-up pass also found document processing/deletion and announcement-key retirement acquiring resource locks before authorization. These now authorize the immutable resource scope before locking/re-reading its current state. Planning acquires activity locks in ID order before document locks, matching privacy erasure. Erasure prelocks both eligibility-affected and creator-attributed activities together in ID order.

Invitation acceptance and revocation discover the issuer without a row lock, lock actor and issuer persons in sorted order, then authorize before locking and revalidating the invitation. Serializable isolation is selected before discovery. This prevents issuer erasure from holding the identity while acceptance holds the invitation, and prevents crossed membership-lock upgrades between accepting organizers. Serializable conflicts remain whole-operation failures; no suffix retry was introduced.

Invitation metadata listing now writes a `plan:read` audit event for its loop inside the same transaction. Audit persistence failure prevents the private metadata from being returned.

## Verification

- Before implementation, three regression assertions failed: reopened inbox visibility, revised-event visibility, and rejection of global-only delegated inbox access.
- Six focused PGlite suites passed: 46 tests covering activities, access, memory, feedback, confirmation, and privacy.
- Seven native PostgreSQL tests passed covering raced confirmation consumption, concurrent same-person writes with a widened lock-upgrade window, role/membership/hierarchy lock retention, deterministic person-before-activity acquisition, resource authorization before document/key locks, issuer-before-invitation ordering, and withdrawal versus finalization. The document and invitation regressions each failed with real `NOWAIT` lock errors before their corresponding fixes.
- Follow-up focused runs passed: knowledge/announcements/planning/privacy (27 tests), activities/assistant actions (14 tests), and invitations (16 tests including audit failure).
- TypeScript `--noEmit` and focused ESLint checks passed. No production build, deployment, or commit was performed.

These checks verify the reported database races. They do not establish exactly-once external transport: delivery still relies on the transport honoring the inbox ID as an idempotency key, as documented by the worker contract. Direct administrative SQL that bypasses lifecycle services is outside the application's ordering contract.

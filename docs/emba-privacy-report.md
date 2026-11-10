# EMBA pilot privacy lifecycle

Implementation scope is EMBA pilot data, not deletion of the shared public-board account. First-party authentication remains disabled pending provider integration. No production data was used or changed.

## Implemented behavior

- Export and pilot deletion require a trusted verifier's authentication timestamp no older than five minutes. Missing, future, expired and delegated authentication are denied. The timestamp never comes from a form; OAuth remote tokens remain delegated.
- Export uses explicit columns for the current member's profile, memory versions, feedback, commitments, leases, inbox and audit. Other people's dependency IDs, invitations, private logs and wants are omitted. Audit persistence and the transaction must succeed before output is returned.
- Pilot deletion revokes every linked EMBA identity and lease, runs the activity eligibility hook in the same transaction, withdraws commitments and suspends dependent commitments before removing their dependency IDs. It removes private memory versions and operations, feedback, confirmations, delivery records, cursors, memberships and invitation records associated with the member. Invitations to the current verified email are removed as well.
- Historical resolution participant IDs and activity creator IDs become null. Deleted-member audit rows retain action/time/outcome but lose person, client, resource and lease identifiers. No replacement stable participant pseudonym is created.
- Organization document sources and their indexes, signed announcements and activity descriptions remain organization publications. Uploader and key-registration attribution becomes null. The original uploader cannot resume a pending document job after deletion. These source bodies may contain names written into the publication; this implementation does not claim to redact arbitrary prose.
- Immutable signed announcement envelopes retain the original `authorId` UUID. Removing it would invalidate the signature. The member deletion screen now explicitly discloses retained authorship history and names embedded in publication text; the publication-attribution policy remains a release gate.
- The shared legacy `person` record, name and phone remain for public-board functionality. This must be disclosed as **Delete pilot data**, not account erasure. Personal-data access through EMBA is denied thereafter, including previously authenticated principals.

## Restore and retention

`emba_deletion_tombstone` is a private, RLS-protected ledger keyed by person UUID, with no person foreign key. Authentication and personal/loop access deny tombstoned records even if a stale identity is restored. Live access holds identity locks through transactions so deletion cannot race an authorized operation's commit. An external durable copy of the tombstone ledger is required operationally; restoring an old database without the current ledger is unsafe.

Restore procedure: stop all portal/MCP readers and workers; restore the database in isolation; load the current external ledger via `applyDeletionTombstones(db, personIds)`; this transaction imports the ledger and repeats the purge for all known tombstones; verify denial with previously valid principals and absence of personal rows; only then enable traffic. Never restore the ledger from the same stale backup as the data. The application does not operate the backup provider or enforce an infrastructure traffic barrier.

`expirePrivacyCapabilities(db)` deletes only already-expired confirmations, leases and inbox cursors. Their timestamps express capability validity, not an approved retention period. No destructive audit/history/backup retention job is scheduled. Revocation stops future access and cannot recall information already delivered. Backups are not immediately erased by pilot deletion.

Exact audit, compiled-history and backup retention durations, organization-publication attribution rules, handling of personal information embedded in publication prose, cross-product account deletion, external tombstone durability and the restore traffic barrier require approval and operational rehearsal before real enrollment. Consequently tasks 7.3/7.4 remain partial release gates; this report is not an approved retention policy.

Pending invitations addressed only by verified email have no person-ID relationship before acceptance. Live deletion removes invitations matching the current verified email, but a person-ID-only external tombstone ledger cannot identify those recipient-email rows in an older backup. Restored identity access remains denied. A production restore policy must also resolve invitation recipient cleanup before reopening traffic; the current hook does not claim complete email erasure from stale invitations.

## Data inventory

| Area | Tables / deletion behavior |
| --- | --- |
| Identity and authority | `emba_identity`, `emba_membership`, cascaded `emba_role`, `emba_lease`: revoked/purged |
| Memory and feedback | `emba_memory`, cascaded versions/operations, `emba_feedback`, `emba_feedback_operation`: purged |
| Confirmations and delivery | `emba_confirmation`, `emba_inbox`, cascaded `emba_outbox`, `emba_inbox_cursor`: purged |
| Activities | own commitments/operations/consents purged; dependencies suspended then IDs removed; resolution outcomes and creator attribution nulled; organization terms and safe reports retained |
| Invitations | issuer/accepted-member records and current verified-email recipient records purged |
| Knowledge | document operations purged; uploader attribution removed; organization source/version/passage records retained |
| Announcements | key registrant attribution removed; organization keys, versions and signatures retained |
| Audit | identifying columns nulled; event action/time/outcome retained pending approved duration |
| Legacy | shared `person` and public-board records retained and explicitly outside pilot deletion |
| Tombstone | restricted person UUID/date retained separately for restore denial; never exposed in member output |

There are no durable personal summaries, embeddings or private-memory background jobs in the current schema. New derived personal storage must join the purge before introduction.

## Verification

Real PGlite migrations and integration tests exercise fresh-auth denial, cross-user export isolation, audit failure rollback, dependency suspension, history deidentification, retained organization sources, stale document worker denial, restored identity denial and semantic expiry without audit pruning. Access, activity and knowledge regression tests are included. TypeScript and focused ESLint checks are run by the implementation session; no production deployment or data mutation is authorized by this report.

The purge prelocks activities referenced by historical as well as current commitments before changing dependencies. All seven native PostgreSQL privacy tests, including the historical-commitment lock regression, passed under the elevated runner. The earlier non-elevated startup failure occurred before tests. The PGlite privacy suite, TypeScript and focused ESLint checks pass.

An actual local physical cold-backup/restore rehearsal also passed, importing a newer independently exported deletion ledger into a stale restored database before readers/workers were exercised. See [the restore rehearsal report](emba-restore-rehearsal.md) for evidence, commands, cleanup, and the production durability/traffic-barrier gates that remain.

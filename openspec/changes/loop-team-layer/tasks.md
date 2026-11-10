## 1. Baseline and addressing

Build rules are in design.md, "How this is built": most capable model for every section, test first, and a review gate that must close before the next section starts.

- [x] 1.1 Run the existing suite and record the baseline; confirm `loop-resource-workspaces` 5.1 to 5.3 (hosted gate) status before scheduling team use.
- [x] 1.2 Add a regression test that the MCP routes and JSON endpoints ignore `X-Subject-Id` and similar identity headers.
- [x] 1.3 First version of `@` resolution and listing with the opt-in handle and its form on the group page (`lib/emba/tags.ts`, migration `20261109000000_emba_member_handle.sql`); 6 tests pass.
- [x] 1.4 Revise addressing to this design: events table with create, rename, archive; nested addressed groups reported as teams; one namespace per team across handles, event slugs and group slugs; no person IDs in assistant results; partial-listing marker; delete the handle on membership revocation.
- [x] 1.5 Review gate: independent fresh-context review of section 1 against the addressing spec; verify each finding, fix blockers and majors with tests, add a row to the review record.

## 2. Records

- [x] 2.1 Migration: record kinds, per-team record number, record-level decision, output and claim columns, partial unique index for one current decision per topic, team decision counter, change sequence, tags, reported-conflict events, claim statuses and recorder, overlap marks, team timezone, and the per-team state row that holds the counters. Test constraints and Data API denial.
- [x] 2.2 Isolation from shared notes: team records live in their own tables (design D2); test that the note tools cannot see or change a team record, and that team tools cannot see or change a note.
- [x] 2.2a Review gate: independent review of the migration and the isolation test (2.1, 2.2) before any service is built on them.
- [x] 2.3 Text hygiene shared by all kinds: single-line normalisation, field limits, rejected content absent from logs and audit.
- [x] 2.4 Outputs: URL constraints, unrecognised-host label from the built-in list, file, correct, replace, close a claim, withdraw with content removal from all versions.
- [x] 2.5 Decisions: new-topic confirmation, explicit supersede with compare-and-swap, no correction, concurrent writers.
- [x] 2.6 Claims: self-claim, claim proposed for another member, confirm and decline, overlap marks, done and released by owner, recorder or organizer, due date in team timezone.
- [x] 2.7 Conflict check: counter locked in the save transaction, stale version, reported-conflict event, file-anyway, flag survives edits, needs-re-check on supersession, `conflictsWithOutputs`. Include a concurrent decision-versus-output test.
- [x] 2.8 Person tags on records, mentions, self-removal.
- [x] 2.9 Write caps per person, assistant and team; team-level caps.
- [x] 2.10 Retry handling: optional operation ID and the 10-minute identical-write window.
- [x] 2.11 Leaving and deletion hooks in `revokeMembership` and account deletion: release claims, remove tags, delete handle; keep the author link; extend export with claims and handle. Existing privacy tests stay green.
- [x] 2.12 Concurrency (design D16): per-team write lock with a 2-second wait, numbers assigned under the lock, access and caps re-checked inside the transaction, snapshot reads. First establish whether the test database supports parallel connections; run the five-writer, simultaneous-retry and caps-under-contention tests wherever it does. Result: the local test database has one connection; the multi-writer tests are in `lib/__tests__/emba-team-records-concurrency.test.ts`, run with `QB_DB=remote`, and are required in 5.1.
- [x] 2.13 Review gate: independent review of section 2 against the team-records spec, including races, caps and deletion.

## 3. Tools

- [x] 3.1 Team route `/api/mcp/team` with the eleven tools; existing routes unchanged. Test listing and callability on both.
- [x] 3.2 `team_brief` and `team_state` with scope, roll-up and caps.
- [x] 3.3 `whats_new` on the change sequence with cursor, 7-day default and a no-missed-change test.
- [x] 3.4 `file_output`, `log_decision`, `claim`, `amend_record` over the services; team handle input and the read and write defaults; write annotations.
- [x] 3.5 Human references: record numbers and topic keys accepted as input everywhere; no person IDs returned.
- [x] 3.6 Plain-text formatters for every tool and error on the team route, with rule tests (forbidden characters, line and total length, URL placement, quote prefix, forged-line input) in addition to snapshots.
- [x] 3.7 Untrusted-data marking; test that a write following a read of instruction-like text is still capped.
- [x] 3.8 Renewal of read-and-write team grants; expiry warning in `team_brief`.
- [x] 3.9 Review gate: independent review of section 3 against the team-tools spec, including consent, identity, text forgery and injected-write paths.

## 4. Site

- [x] 4.1 Brief editor with deadline, timezone and history.
- [x] 4.2 Events: create, rename, archive.
- [x] 4.3 Announcements: post and withdraw.
- [x] 4.4 Team page: current decisions, outputs, claims, conflict flags; "your recent saves" with the assistant named; withdraw, confirm or decline a proposed claim, mark claim done or released, remove a tag on yourself; organizer withdrawal; unrecognised-host label on links.
- [x] 4.5 Connection page: read or read-and-write per team and assistant, with the new wording for write.
- [x] 4.6 Review gate: independent review of section 4 against the team-curation spec, including role checks on every server action.

## 5. Verification

- [ ] 5.1 Run the multi-writer tests against a disposable real Postgres (`QB_DB=remote`); all must pass. Then the two-assistant rehearsal on one disposable database, one of them given only the text form: file, conflict reported, file-anyway, decision superseded, flag to needs-re-check, claim, claim proposed and confirmed, five simultaneous writers, tag, whats_new, withdraw, revoke.
- [ ] 5.2 Browser pass over the site flows in section 4.
- [x] 5.3 Types, lint on changed files, full suite, and one production build at the end.
- [x] 5.3a Final independent review of the whole diff before the hosted gate; no open blocker or major.
- [x] 5.4 Founder: confirm the `plan:read` and `group-memory:write` scopes exist in the Clerk Dashboard and are advertised by the resource metadata.
- [ ] 5.5 After the hosted gate: connect two different real assistants to one team; record for each whether the model receives the text form, the structured form or both.
- [ ] 5.6 Run the founder's team deliverable; record the four done-when measures and the number of reported conflicts.

## 6. Reconciliation of other changes (housekeeping, no requirements)

- [x] 6.1 Archive `loop-mvp` as superseded without syncing specs.
- [x] 6.2 Archive `loop-portable-group-memory` as superseded by this change, with a note listing what was kept.
- [x] 6.3 In `loop-emba-intent-platform`, move tasks 1.4, 6.3, 7.1, 7.3, 7.4, 7.5 to a "deferred to cohort" section; leave 1.3, 2.3, 2.5, 3.6, 8.2, 8.3 as the hosted gate.
- [x] 6.4 Add a parked note to `quorum-board-sms` and `loop-sun-layout` listing only the founder's hosted steps.
- [x] 6.5 Dropped: `period-offline-finance-workbench` and `work/calculator-mockup` are an unrelated, uncommitted project; they are left untouched and are not part of this change.

# Local PostgreSQL cold-backup restore rehearsal

On 2026-11-06, `lib/__tests__/emba-restore.test.ts` passed against the disposable native PostgreSQL runner. This is an actual physical cold backup and restoration, not row reseeding or a mocked database. No production database, credential, backup provider, or retention policy was used.

## Scope and safeguards

The test requires both `QB_DB=remote` and explicit `EMBA_RESTORE_TEST=1`. It verifies the runner-generated credential shape and the exact source endpoint `127.0.0.1:55439/postgres`. It also verifies that PostgreSQL's resolved data directory is a disposable `data-*` directory inside this workspace's `.playwright-mcp/emba-postgres` folder. Normal test runs skip this test because it temporarily stops the source cluster.

The bundled native package lacks `pg_dump` and `pg_restore`. The rehearsal therefore cleanly stops PostgreSQL and copies its data directory using bounded Windows `robocopy` operations. Copying uses `/E /MT:16`, never mirror or purge flags. The source is restarted before deletion. The stale backup is copied into a separate data directory, started on a free loopback-only port, and its synthetic database is renamed to a distinct restore database. All connections use generated runner credentials. Plaintext credentials are absent from command arguments and logged output; a physical PostgreSQL backup necessarily contains the cluster's password verifiers.

Backup copies and the later ledger are separate scratch artifacts. Cleanup closes owned connection pools, stops the restored cluster, restarts the source if an intermediate failure left it stopped, drops the synthetic source database, and removes only a verified workspace-contained scratch directory. The runner then stops its original cluster. Command timeouts leave room for cleanup before the test timeout. Failed cluster shutdown preserves the corresponding scratch data rather than removing a running database's files.

## Executed sequence and evidence

1. Seed two synthetic members, independent private wants, a delegated lease, a pending organization-document job, an activity, commitments, and pending notifications.
2. Close connections, stop the disposable source, and make a physical backup **before deletion**. Restart the original source.
3. Call the real `deletePersonalData` service. Export the resulting current tombstone IDs to a separate JSON ledger **after deletion**.
4. Restore the old physical backup into a separate cluster/database. A maintenance-only diagnostic confirms the old identity and private memory have returned and the old backup contains no deletion tombstone. No application payload reader or worker runs at this stage.
5. Read the separately exported current ledger and call the real `applyDeletionTombstones` hook before exercising application outputs.
6. Verify that old authentication, a previously authenticated principal, the stale delegated principal, and the pending document worker are denied. Check that identity, membership, lease, memory/version/operation, commitment/activity-operation, inbox, and document-operation rows for the deleted member are gone. Organization document and activity attribution is null.
7. Verify that the unrelated member still authenticates and retains their private want. Delivery sends only to the unrelated eligible member. Reapplying the ledger is safe and preserves that member's data.

The final restore run passed in 7.04 seconds. A separate native privacy suite passed all seven tests, including the historical-commitment deletion lock-order regression. Focused lint and TypeScript checks passed. The initial serial JavaScript filesystem copy exceeded its 120-second test limit on OneDrive; that attempt was stopped and its partial scratch directory removed after checking that no database or copy processes remained. The native-copy implementation resolved that issue. After the successful runs, no restored scratch directories or PostgreSQL/robocopy processes remained.

## Reproduce locally

With the existing native binaries installed as described in the pilot setup, run this test by itself from PowerShell through the disposable runner:

```powershell
$env:EMBA_RESTORE_TEST='1'
try {
  node scripts/emba-postgres-check.mjs lib/__tests__/emba-restore.test.ts
} finally {
  Remove-Item Env:EMBA_RESTORE_TEST -ErrorAction SilentlyContinue
}
```

Use the elevated execution context required by the local native runner. Do not run another native suite or application against that disposable cluster concurrently.

## Remaining release gates

This verifies same-version local physical restoration and the tombstone replay contract. It does not approve a production backup provider, externally durable ledger storage, cross-version restoration, a production reader/worker traffic barrier, or any retention duration. Operationally, a current ledger must be durable independently of the stale backup and applied while restored readers/workers remain disabled. Those production decisions remain task 7.4 release gates; no infrastructure traffic barrier or retention job was added.

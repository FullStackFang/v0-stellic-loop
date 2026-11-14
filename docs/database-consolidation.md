# Pet-project database consolidation

Requested November 7, 2026: consolidate Loop, Roam, Runs, Stoop and Voit into one hosted database, preserving schema and data. No source may be retired before verified copy and application cutover. No Docker.

## Verified inventory

All five belong to the Vercel-managed Supabase organization `vercel_icfg_sVzuxnbJTTSAuowb9Xp8fb6d`. The Supabase CLI was reauthenticated to this workspace by the user. Unrelated EmanuEl projects are excluded.

| App | Project reference | Observed state | Migration considerations |
| --- | --- | --- | --- |
| Loop | gtxvuhxjequvhxuerfdw | Active | 11 application tables; zero Supabase Auth users and storage objects. Hosted schema predates the local EMBA implementation; copy the actual source, then apply application upgrades separately. |
| Runs | fhtbbdmhfhrvuohcfkso | Active | 1,180 auth records, 29 auth identities, one storage bucket/object; public, private and runs_internal schemas; pg_cron and pg_net; numerous security-definer functions. Auth records are not necessarily distinct active people. |
| Stoop | zipuqihidfkynvoaejza | Active | 23 public tables including migration history; zero Supabase Auth users and storage objects. |
| Roam | xwatrvekqublfmajyrcl | Active | Resumed; 48 application tables copied across roam, roam_asker and roam_pulse. Source retained pending application cutover. |
| Voit | soihacnbczjlugocwzou | Active | Resumed; 3 proof tables / 22 rows copied into voit_proof. Zero auth users or storage objects. Source retained pending application cutover. |

## Copies completed so far

Native PostgreSQL 17.11 `pg_dump` custom archives exist for Loop, Runs and Stoop under the git-ignored `.playwright-mcp/consolidation/backups/` directory. Each has a SHA-256 manifest and readable `pg_restore --list` directory. Loop and Stoop application schemas passed native PostgreSQL 17 restore, relocation, and function smoke checks; Runs remains an export without a restore rehearsal. Runs includes auth, storage metadata and cron definitions; the storage object's actual bytes and external service settings remain to be exported. Secret-bearing files and data archives must stay out of Git.

Verified preliminary copies now exist in `supabase-shared`: `loop` has 11 tables / 11 rows / 44 constraints / 21 indexes; `stoop` has 18 tables / 7 rows / 67 constraints / 34 indexes. Hosted row checksums, counts, constraints, indexes and sequence positions match the restored archives. Checksums use the same session timezone (`America/New_York`) to normalize timestamp rendering. Evidence is in ignored `loop-hosted-verification.json` and `stoop-hosted-verification.json` beside the archives. Source exports are snapshots, not ongoing replication.

Both schemas deny access to `anon`, `authenticated`, and `service_role`; grants were revoked in the import transaction and schema access denial was verified. Source functions were adjusted for their new schemas: Loop's `lock_proposal` search path and the three reviewed Stoop function definitions. No source rows, application connections, existing Runs schemas or billing plans have been changed. CLI linking used separate ignored workspaces; the application's project binding is unchanged. No new hosted resource has been created. Application cutovers and final-delta copies remain outstanding.

## Approved destination

The user approved reusing Runs and renamed it to **supabase-shared**. CLI verification confirms the unchanged project reference `fhtbbdmhfhrvuohcfkso`, region `ca-central-1`, and healthy state. Retain its existing public/internal schemas and auth system while adding isolated `loop`, `stoop`, `roam` and `voit` schemas with app-specific credentials. PostgreSQL schemas provide the requested namespacing without prefixing every table. Moving existing Runs tables to a `runs` schema requires a separate application/RPC/job migration; do not relocate live tables just for naming consistency.

Copying into the shared host is authorized; preserve source databases and verify copies before application cutover. No new project or subscription is needed. Existing sources remain billable until deliberately retired after acceptance. Roam and Voit remain paused after the rename; their resume/export is still pending.

## November 8 progress and cutover checks

- Created `loop_runtime` and `stoop_runtime` login roles with no superuser, database creation, role creation, inheritance, or RLS bypass. Each has a role-level search path containing only its app schema and `pg_catalog`, schema usage, DML grants and role-specific server RLS policies. Stoop's migration ledger is read-only to its runtime role. No schema creation or table ownership was granted.
- Verified both actual session-pooler logins, unqualified reads across all copied tables, rollback-only function calls, and zero direct table privileges in the other app/managed schemas. Credentials remain in ignored private files; no application environment has been switched. New tables require reviewed grants/policies before runtime access.
- Exported the one Runs storage object (5,135 bytes), verified its metadata size and source ETag against the downloaded content, and recorded a SHA-256 manifest under ignored `backups/storage/`. External service settings still need separate preservation.
- Loop's live source still matches the copied snapshot. Stoop's source advanced from 18 to 23 tables and migration versions 1–7 to 1–9. A fresh source archive is retained (`stoop-1794144260840.dump`). The additional catalog/match migrations were synchronized transactionally, preserving source migration hashes and timestamps. Complete data checksums, sequences, columns, constraints, indexes, triggers and function definitions matched before commit; evidence is in `stoop-sync-verification.json`. The five new tables have scoped runtime grants and policies.
- Actual Loop `fromPool` and Stoop `database`/`listBuildings` adapters passed read-only checks against their new credentials. Stoop's existing certificate validation passed, including reads of the new catalog table. Evidence: `app-driver-verification.json`. These checks do not establish that undeployed local application features have all required migrations, nor replace HTTP verification before cutover.
- Independent read-only app reviews found that local Loop code requires trip/EMBA upgrades beyond the copied live schema. Its embedding readiness check also names `public` explicitly. Stoop's migrations and verification scripts contain explicit `public` references and checksum-protected history; do not bulk-edit historical migrations or run them against the shared `public` schema. Stoop has substantial unrelated working-tree changes, which remain untouched.
- User resumed Roam; the platform is now healthy. A complete application/auth/storage archive is retained as `roam-1794144678972.dump`, including the discovered `asker` and `pulse` schemas (the earlier Roam archive omitted those two and is not the complete backup). Voit remains pending resume.
- Roam's native PostgreSQL 17/PostGIS 3.6.2 rehearsal restored all archived schemas, including local auth/storage, and verified unchanged data after renaming application schemas to `roam`, `roam_asker`, and `roam_pulse`. These contain 48 application tables / 1,917 rows; the extension-owned `spatial_ref_sys` is excluded from application counts. Source/shared supported PostGIS version is 3.3.7; the application export does not include extension binaries or built-in definitions.
- Roam's one auth account shares an email with a Runs account but has a different UUID. The user explicitly chose the existing shared login. Offline remapping followed foreign-key references, preserving constraints and trigger states: one application profile and four broadcast ownership references changed. Original IDs remain in the source archive. No shared auth rows have been changed. Do not attach Roam's signup trigger or Cornell-only auth webhook to shared auth, and keep seed/delete-auth functions unavailable to client roles.
- Compute is hourly, but paid-plan projects cannot be assumed pausable in place. Current Supabase pausing documentation requires moving a paid project to a Free organization before pausing; verify Marketplace-specific options before choosing retirement. No source retirement is authorized merely by completing a copy.

## Required migration checks

### Latest checkpoint: hosted Roam copy and preview verification

Roam's hosted copy is committed in `roam`, `roam_asker`, and `roam_pulse`: 48 application tables and 1,917 rows passed per-table counts and checksums before commit. Evidence: ignored `roam-hosted-verification.json`. Shared auth was not modified; approved ownership remapping is preserved in the private mapping record. Managed PostGIS 3.3.7 is installed in `roam`. Client roles remain denied access pending application membership/RLS review.

Do **not delete the Roam source yet**. The Expo Roam client and the local loyalty-signal-engine configuration still reference that source; application cutover, authentication and final-delta verification remain outstanding. The discovered Asker/Pulse consumers also need accounting for. The original full archive remains retained.

Loop and Stoop have preview-only Vercel connection overrides; production settings are unchanged. A PowerShell/npx stdin encoding issue introduced a BOM into preview connection URLs. The uploader now uses raw UTF-8 Node child-process input. Scoped credentials were rotated after preview error logging included a malformed connection URL; never print raw runtime logs. Latest Loop preview is `dpl_G9r2W26DWYbRK4Q36RGMvFJu8u5e`, awaiting HTTP acceptance. On the latest actual-driver recheck Loop authenticated and read its board table, but Stoop failed authentication (`28P01`); investigate before treating previews as accepted or switching production. Voit resume/export is still pending verification.

### Voit copy completed November 8

Voit resumed through `COMING_UP` and `RESTORING` to `ACTIVE_HEALTHY`. Read-only inventory found the application data exclusively in `proof`: sessions (6 rows), answers (8), item_exposure (8). No auth users, storage objects, application functions or application triggers were found. The full selected-schema backup includes public, proof, auth and storage (`voit-1794148731622.dump`, 263,798 bytes; SHA-256 `3aa1e8daceb813ad4b06f87783a9c6daa6e16c984a5fea0e841e125b1a9a788c`).

Native PostgreSQL restore rehearsal verified all application rows unchanged after renaming `proof` to `voit_proof`. Hosted import refused an existing destination schema, then verified every table's count/checksum, 6 constraints, 4 indexes, enabled RLS on all 3 tables and denied schema access for anon/authenticated/service_role before committing. Evidence: ignored `voit-rehearsal.json` and `voit-hosted-verification.json`. No Docker was started; temporary native PostgreSQL was stopped. Source data and production connections were not changed.

The matching application is sibling `v0-voit-proof`, whose `src/server/store.ts` explicitly queries `proof.*` and uses `DATABASE_URL`; its `.env.example` identifies the Voit project. It needs a scoped runtime credential and reviewed schema-reference changes before cutover. The separate `v0-voit` repository supports PostgreSQL/PGlite, but its public-schema store does not match the hosted inventory. Account for all consumers and final writes before retiring Voit's source.

1. Resume/export paused sources and inventory their auth users, storage bytes, functions, extensions and jobs. Retain source UUIDs. Inspect auth identity collisions before combining any auth systems; never silently merge users by email.
2. Back up source app schemas/data, migration history, grants, policies, functions, triggers, sequences and dependencies. Export managed service settings separately. Copy actual storage bytes and verify checksums.
3. Rehearse restores and schema relocation before hosted changes. Review schema-qualified function bodies, security-definer search paths, extension references and cross-schema dependencies. Do not globally replace SQL strings or activate copied jobs/webhooks during rehearsal.
4. Use app-specific roles and grants. RLS and Supabase Auth are project-level concerns; schema separation alone does not isolate anonymous/authenticated clients. Keep app membership and authorization explicit. Coordinate per-app migration histories rather than letting repositories share one undifferentiated migration ledger.
5. Verify table counts and content checksums from consistent snapshots, constraints, sequence positions, policies, RPC behavior and cross-app denial. Choose the shared region deliberately.
6. Prepare app-specific connection/schema changes and test each app against its copy. Account for API URL/auth redirects/Realtime/storage settings where applicable. Capture final deltas during a brief coordinated write pause; a preliminary dump is not a final cutover snapshot.
7. Cut over one app at a time with rollback settings saved. Retire old resources only after successful app verification and an explicit retention decision. Never run a reset or destructive test against the shared live database.

Official references: [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute).

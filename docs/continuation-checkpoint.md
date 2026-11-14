# Continuation checkpoint — November 8, 2026

## Active intent

User wants to finish the original OpenSpec change, `loop-emba-intent-platform`, and asked whether to compact. Read its proposal, design, specs and tasks before implementation. Apply instructions report **39/51 tasks complete, 12 remaining**. `openspec status` reports artifacts complete; this does NOT mean implementation complete. Do not archive or mark remaining gates complete without evidence.

Pending task IDs: 1.3, 1.4, 2.3, 2.5, 3.6, 6.3, 7.1, 7.3, 7.4, 7.5, 8.2, 8.3. Read the November 7 continuation notes in tasks.md: Clerk identity and narrower shared-memory MVP pieces already exist, so inspect current implementation rather than rebuilding them. Relevant records: docs/emba-current-state.md, emba-mvp-slice.md, emba-clerk-setup.md, emba-remaining-inputs.md and the separate loop-portable-group-memory change.

Recommended sequence: reconcile current code/evidence with remaining tasks; finish independent implementation and local acceptance; resolve pilot policy choices and actual-account OAuth acceptance; deploy/verify; then archive only when satisfied. The portable-group-memory change is separate scope, not implicit completion of the foundation.

## Database consolidation is separate and unfinished

See docs/database-consolidation.md for detailed state. Shared host is former Runs, now supabase-shared, ref fhtbbdmhfhrvuohcfkso. Copies verified: loop (11 tables/11 rows), stoop (23 tables/9 ledger rows), roam + roam_asker + roam_pulse (48 tables/1,917 rows), voit_proof (3 tables/22 rows). Runs remains in place. All original projects retained; no production app cutover is verified. Do not delete any originals.

Voit was resumed and copied successfully this session. Matching consumer is sibling v0-voit-proof; src/server/store.ts hardcodes proof.*. Roam clients include v0-roam-app and a configuration in v0-loyalty-signal-engine; account for Asker/Pulse consumers too. User approved mapping Roam's sole login to the existing shared account; original IDs remain in backups. Shared Roam schemas remain inaccessible to client roles pending membership authorization work.

Loop/Stoop preview-only DATABASE_URL overrides exist. Production configuration is unchanged. Latest Loop preview: dpl_G9r2W26DWYbRK4Q36RGMvFJu8u5e; HTTP acceptance pending. Latest actual-driver check passed Loop but Stoop returned 28P01. Investigate scoped password propagation/config before cutover. Never print raw runtime errors: prior malformed URLs included credentials, which were subsequently rotated. Use direct Node child-process stdin for Vercel secret upload; PowerShell piping through npx introduced a BOM.

Backups, credentials, migration scripts and detailed verification evidence live in ignored .playwright-mcp/consolidation/. Never commit these secret-bearing artifacts. The native pg_dump backup workflow uses authenticated Supabase CLI db dump --dry-run solely to acquire temporary connection settings; no Docker. Temporary logins expire/rotate, so refresh before use and avoid interleaving same-project CLI calls with native operations. Do not extract tokens from the OS credential store; that approach was rejected by approval review.

## Constraints

- User explicitly said never start Docker. Native PostgreSQL rehearsals are allowed; stop them after use.
- Preserve unrelated work, including untracked work/, docs/superpowers/, openspec/changes/period-offline-finance-workbench/ and reports/ observed in latest git status.
- No source application changes or commits were made during the latest Voit-copy work. docs/database-consolidation.md and this checkpoint are untracked documentation.
- Only run a production build for shipped code changes, once at the end; data/docs migration checks need targeted verification instead.
- Current local Loop code requires trip/EMBA migrations absent from the copied legacy live schema. Never deploy it against the shared copy without addressing that gap.

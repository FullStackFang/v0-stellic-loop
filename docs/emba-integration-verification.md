# EMBA integration verification — 2026-11-07

This checkpoint implements configured service-held Ed25519 signing, durable document claims/retries, optional document vector storage/retrieval, and the Gateway embedding adapter used by the worker, manual processing and explicit semantic MCP tool. Semantic processing defaults off. No hosted migration, deployment, real-member enrollment or live signing-key provisioning was performed.

## Current evidence

- Full application suite: **525 passed, 23 skipped**, across 68 passing and four skipped files. Skips include native-only process/concurrency cases and opt-in HTTP/restore cases. The optional integration tests use real PGlite/pgvector and mock only inference.
- Latest native Windows PostgreSQL run: **28 passed** across configured signing, document batch processing and actual killed-process recovery. No Docker is required for these checks.
- Final built-Next HTTP checks: **three passed** against an isolated native database, verifying classified legacy HTML/files/previews and old credentials remain denied while an unrelated public board remains available. This does not exercise authenticated EMBA Server Action transport.
- Prior actual PostgreSQL 17.11/pgvector 0.8.7 evidence: **five vector-core tests passed**, covering scoped ranking, lifecycle, SQL constraints and authority/audit/source revalidation. The expanded native adapter/worker/MCP/action suite was prepared but did not run successfully because Docker was unavailable. The user requested no further Docker startup; that preference is preserved. Do not claim the expanded integration was verified natively.
- Repository TypeScript, changed-code ESLint and one final Next.js production build passed. OpenSpec strict validation passed.
- A synthetic live Gateway request reached the service but returned **HTTP 403 with a credit-related reason**. No successful live vector output or semantic-quality evaluation is claimed. The temporary local OIDC environment file was removed after the smoke test.

Independent review identified missing pre-transmission auditing and source locking. Both were corrected. Metadata-only attempt audits now commit before provider invocation, and audit failure prevents transmission. Current-source shared locks follow authority locks; final persistence/retrieval revalidates authority. Regression tests cover provider failure, audit failure, late revocation and a changed source. No other actionable signer/worker/vector findings remained in the independent review.

## Scope and remaining gates

Tasks 4.3 (cited keyword/vector retrieval with actual pgvector evidence) and 4.5 (recorded signing custody and key lifecycle) are complete. The original change is **39/51 tasks complete**. This does not close live provider quality, hosted operations, real-host authentication, policy or enrollment gates. Broader compound tasks remain unchecked where actual account or policy acceptance is missing.

See [remaining inputs](emba-remaining-inputs.md), [embedding boundary](emba-embeddings.md), [worker recovery](emba-worker-recovery.md), and [signing custody](emba-signing-custody.md). The separate portable group-memory specification remains unimplemented; this checkpoint continues its prerequisite foundation.

## November 8 continuation

The current checkout passes `tsc --noEmit`. A full `npm test -- --reporter=dot` run recorded 498 passing tests, 88 skips and five suite setup timeouts in `openTestDb()` under parallel worker startup. Those same five files passed together with `--maxWorkers=1 --no-file-parallelism`: 65/65 tests. The broad run therefore has no remaining reproduced assertion failure; it is not a clean default-command pass. No application code or OpenSpec checkbox changed in this continuation.

The remaining original tasks are still **39/51 complete**. Invitation acceptance is implemented against verified first-party identity, including single use, expiry, recipient and issuer-authority checks; actual Clerk browser acceptance is still required. The privacy implementation covers live personal deletion, capability expiry and UUID tombstone replay. Restored email-only invitations cannot be identified from UUID tombstones alone, so the owner-approved restore policy must specify their treatment before that gate can close. Raw conversation compilation and actual Claude/ChatGPT OAuth acceptance remain outstanding. Browser control was unavailable during this continuation, so no Dashboard configuration or live host test occurred.

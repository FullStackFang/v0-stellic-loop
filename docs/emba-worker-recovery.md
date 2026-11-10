# Local worker process-loss recovery

The native PostgreSQL rehearsal kills actual Node worker child processes at durable boundaries, then starts fresh processes against the same disposable database. It calls the production document batch runner, `processDocument`, and `deliverPending` services.

## Scheduled document processing

`GET /api/cron/emba-documents` authenticates the existing `CRON_SECRET` bearer credential before opening the database. It accepts no person, document, batch-size, or authority parameters. It returns only aggregate counters with `Cache-Control: no-store`; unexpected database failures return a sanitized 503. The endpoint uses the existing Node runtime, a 60-second function maximum, a 45-second between-job time budget and at most ten document versions per invocation.

Apply `20261107030000_emba_document_worker.sql` before using this endpoint. Each version has a durable scheduled-attempt count and next eligible time. A short `FOR UPDATE SKIP LOCKED` claim transaction increments that count and reserves the job for five minutes, then commits before taking any identity, role, or document locks. Concurrent invocations skip active claims. Process loss leaves a claim that becomes eligible again after five minutes. Failed invocations use exponential minute backoff (2, 4, 8, 16, 32) and stop automatic retries after five claims. Manual organizer processing remains available even after that cap. No session advisory lock or new queue provider is needed.

The worker derives its principal from the persisted original uploader's current verified identity, with a one-minute lifetime. It does not hold or refresh an OAuth token. Existing processing stages recheck that identity, current organizer authority, source lifecycle and version. The worker cannot take over a source from a removed uploader. Failed claims contain no raw exception or document payload; an old invocation cannot reschedule a newer attempt. The batch deadline is checked between jobs; the platform timeout can terminate an in-flight job, which uses the same crash-recovery path.

The existing `vercel.json` adds a five-minute schedule for this endpoint, preserving the daily legacy job. The linked Vercel project and its Pro plan were verified read-only; the existing `CRON_SECRET` is configured in production. Apply the worker migration before deploying this schedule. No deployment or hosted run is claimed by these local tests. Portal/MCP inbox polling supplies pilot notifications; no external email or push delivery provider is required. `deliverPending` remains an optional transport hook, whose process-loss behavior is tested below.

After deployment, verify successful authenticated runs in Vercel's cron/function logs, a source progressing to ready, and recovery after a deliberately interrupted synthetic job. Alert on repeated 503 responses and inspect exhausted `worker_attempts=5` sources with the authorized organizer. A five-minute schedule is polling, not a precise completion guarantee; manual processing remains available. Do not log document bodies, identity tokens or SQL parameters. Disabling the cron stops new scheduled attempts, while existing source permissions and version guards remain enforced. [Cron operation and concurrency guidance](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

With `LOOP_EMBEDDINGS_ENABLED=true`, scheduled processing also indexes authorized canonical passages with the configured embedding model. The optional vector schema must exist before the worker claims any work; missing schema fails the endpoint with a sanitized 503. Keyword-only processing remains the default and does not require vector tables. A canonical `ready` document remains eligible when any current passage lacks the active model/dimensions embedding. Vector failures use the same durable backoff and attempt cap rather than silently treating keyword readiness as semantic completion. The returned `ready` counter means the enabled processing steps succeeded; the document's existing `ready` state describes canonical keyword processing only. Model changes can require operator retry for sources that already exhausted their scheduled-attempt budget.

Run the focused checks with the existing isolated native runner:

```powershell
node scripts/emba-postgres-check.mjs lib/__tests__/emba-document-worker.test.ts lib/__tests__/emba-worker-recovery.test.ts
```

The process-loss suite skips outside `QB_DB=remote`; ordinary batch cases also run on PGlite. The child accepts only the runner's `SUPABASE_TEST_DB_URL` on `127.0.0.1` and requires a parent IPC channel. The runner uses generated local credentials and stops PostgreSQL after completion. Synthetic identity verification is confined to this test fixture. Restarted document workers still reconstruct their principal through the current database identity mapping and recheck current authority through the real service.

Process-loss cases cover:

- Death after the extracting-state transaction commits: the source remains unsearchable; a new worker completes it once.
- Death after canonical extraction commits: the indexing state and extraction survive; retry produces one current passage. A further retry leaves the attempt count and passage count unchanged.
- Deletion, correction, or uploader membership revocation during downtime: the restarted original-version worker is denied and cannot publish passages or mark a version ready.
- Death after an outbox sender reports a receipt but before its database transaction commits: retry sends the same inbox ID, completes delivery, and does not mark the human inbox acknowledged.
- Membership removal or an obsolete activity event during that delivery downtime: a fresh worker suppresses the retry and removes the pending obsolete outbox row.
- Death after a scheduled batch claim commits: another invocation skips the live claim, and the job is recovered after its retry time expires.

The accompanying batch tests cover current uploader identity/role/deletion checks, expired/live claims, overlap, ten-job bounds, automatic retry limits/backoff, obsolete versions and authenticated cron access.

Earlier worker verification on 2026-11-07 passed 18 tests across both suites against disposable native PostgreSQL. Subsequent semantic worker cases use real PGlite/pgvector storage with only provider calls mocked. Five vector-core cases previously passed against native pgvector; the expanded optional integration suite's native rerun remains pending because the user requested no Docker startup. See [latest integrated verification](emba-integration-verification.md) for final test, lint, type and build results.

The process kill bypasses the service's ordinary catch/finally paths. Database state is inspected between worker processes, so these checks distinguish committed stages from rolled-back delivery bookkeeping. The parent observes synthetic transport receipts over IPC; it does not store private message content or print database credentials.

Delivery remains **at least once**. The stable inbox ID gives a real transport an idempotency key, but this IPC sink does not prove that any external transport deduplicates. The first receipt before a crash cannot be recalled by later revocation. Attempt counters inside the interrupted transaction can roll back even though a sender observed a receipt; they are not a complete external-delivery history.

Hosted cron execution/availability, operational monitoring, optional external delivery deduplication, and real-provider authentication remain unverified release gates. Canonical local processing requires no provider credential renewal. Optional semantic processing uses Gateway credentials; the attempted live synthetic request returned HTTP 403 for the credit/billing gate, so no live embedding or retrieval-quality acceptance is claimed. See [remaining inputs](emba-remaining-inputs.md) and the authoritative OpenSpec task list for broader completion status.

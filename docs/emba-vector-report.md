# Optional EMBA vector retrieval — local verification

`lib/emba/knowledge-vector.ts` implements provider-independent, server-only vector ingestion and exact cosine retrieval over approved document passages. There is no HTTP/MCP raw-vector endpoint or synthetic production embedder. The opt-in [Gateway adapter](emba-embeddings.md) now connects the scheduled worker, manual resource processing and explicit semantic MCP tool. Synthetic vectors appear only in integration tests.

The opt-in SQL lives in `supabase/optional-migrations/emba-vectors/001_vectors.sql`, outside the ordinary migration chain. Enabling it requires actual pgvector availability; extension creation errors fail the migration. No required object is silently skipped. The ordinary native Windows PostgreSQL test/restore path remains independent of this feature.

## Storage and authority

Embeddings are keyed by document/version/passage ordinal/model ID, with cascading passage foreign keys. Replacement and deletion immediately remove derived embeddings through the existing passage lifecycle. A model ID is bound to one dimension count; use an immutable provider/model/revision identifier when integrating a provider. Dimensions are bounded to 1–2048, batches to 200 unique passage ordinals, and query matches to 20. Values must be finite float32-representable numbers and the stored vector must be nonzero. SQL independently enforces dimension, nonzero and source-reference constraints. RLS is enabled; public, anon and authenticated table access is revoked.

Ingestion requires the current first-party uploader and current manage authority, a locked current ready source version, and an audit write. Upserts make retries idempotent. Late workers cannot publish against replaced/deleted sources. Only existing approved document passages can be indexed; raw conversations and private Wants are not input types or retrieval sources.

Retrieval authorizes the exact organization/loop, materializes its current ready passages, then materializes model/dimension-matched embeddings before exact cosine ranking. No ANN index or cross-tenant ranking is used. Selected explicit claims expand to other authorized passages even when those passages have no embedding. Results retain the existing citation/location/timezone/version/untrusted/disputed shape; distances are never returned as truth. Expansion is capped at 200 passages, as in keyword retrieval. Audit persistence, current lease/authority and locked source version/ready checks occur before returning output.

## Reproduction and evidence

- `node node_modules/vitest/vitest.mjs run lib/__tests__/emba-knowledge-vector.test.ts`: 5 passing tests with actual PGlite pgvector extension.
- `node scripts/emba-vector-check.mjs`: the same 5 tests pass on PostgreSQL 17.11 / pgvector 0.8.7, official `pgvector/pgvector:pg17` image. The runner uses a disposable container, random loopback-only port and generated credentials, never application URLs; cleanup runs in `finally`.
- Earlier combined vector/keyword run: 16 passing tests (3 vector plus 13 existing keyword tests). Final vector additions separately pass in both engines.
- Focused ESLint and repository `tsc --noEmit` pass. No build, deployment, hosted database write or provider call was performed.

Tests cover strongest out-of-scope match exclusion; exact loop scoping despite inherited organizer access; unembedded conflict expansion; model/dimension isolation; duplicate retry; replacement/deletion cascade; stale/revoked worker rejection; malformed, zero, oversized and nonfinite vectors; direct SQL constraints; Data API denial; delegated consent and revocation; audit failure; and authority/source deletion between retrieval and output. Boundary injections execute actual SQL but do not establish multi-connection lock-scheduling behavior.

## Enable and rollback gates

The five-suite integrated native runner is prepared but its final combined run was not executed: Docker was unavailable and the user instructed the agent to stop starting it. Earlier native evidence covers the five vector-service cases; the final adapter, worker, MCP and action integration is covered by PGlite with its actual pgvector extension. See [final verification](emba-integration-verification.md) for scope and current results. No Docker startup is required for the ordinary test suite or native Windows PostgreSQL worker tests.

The fixed model and bounded integration are now implemented; see [embedding processing terms and live credit blocker](emba-embeddings.md). Before production enablement, approve processing terms, evaluate semantic quality and latency on approved data, and test concurrent source/authority changes and backup restore with the extension installed. This implementation performs exact scans within the authorized loop; production capacity limits must be measured before exposing it. Live provider acceptance remains gated.

Apply the ordinary migrations first, then explicitly apply `001_vectors.sql` on a database with pgvector installed. Wire service consumers only after verifying migration success and indexing the intended sources. To roll back, disable/drain consumers first, then drop `emba_document_embedding` followed by `emba_embedding_model`; approved source documents and keyword retrieval remain intact. Re-embedding is required to restore dropped derived data. Do not drop the shared `vector` extension if any other feature depends on it. Existing feature-disabled backup evidence does not prove extension-enabled restore.

Reference: [pgvector official documentation](https://github.com/pgvector/pgvector), checked for exact cosine queries, mixed dimensions and extension behavior. The Supabase changelog Markdown endpoint could not be fetched by the browsing tool (unsupported content type); no Supabase hosted API behavior was introduced.

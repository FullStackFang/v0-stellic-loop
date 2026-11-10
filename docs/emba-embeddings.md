# Semantic embedding boundary

Semantic retrieval uses the server-only `lib/emba/embeddings.ts` adapter and AI SDK 7.0.164. Its fixed model is `openai/text-embedding-3-small`, with 1536 dimensions. Model identity is stored with each vector; changing the model requires reindexing. Ordinary lexical retrieval remains available independently.

## Enablement

The feature is disabled unless `LOOP_EMBEDDINGS_ENABLED=true` exactly. Before enabling it in a deployed environment, apply the separately reviewed `supabase/optional-migrations/emba-vectors/001_vectors.sql` schema. This is deliberately outside the automatic migration sequence. Server helpers check authorization and schema availability before sending text. Applying the schema or deploying this setting requires the project's normal deployment approval.

AI SDK uses Vercel OIDC automatically when deployed without `AI_GATEWAY_API_KEY`. Local scripts need an appropriate securely loaded Gateway credential or linked-project OIDC token. Do not put credentials in committed files or command arguments. Auth/credit availability is checked by an explicitly authorized synthetic smoke request, not assumed from successful unit tests.

## Data sent and retained

Only canonical passages from ready, current documents and authorized search queries are sent. Document indexing requires the current original uploader's first-party organizer authority. Authorization is checked again when vectors are persisted or search results returned. Each request mandates `providerOptions.gateway.zeroDataRetention=true`; retries are disabled, calls run serially in batches of 16, and the entire operation has a 15-second abort signal. Inputs are limited to 200 texts of 4000 characters each. Returned vectors must be finite, nonzero float32-compatible values of exactly 1536 dimensions.

SDK telemetry is explicitly disabled, including inputs and outputs. The adapter returns vectors only and replaces provider errors with `unavailable`, without attaching the provider error as a cause. Source documents are intentionally durable; raw conversation compilation is a different boundary and must not use this adapter. Gateway ZDR has provider-specific qualifications, including safety retention, and does not establish an unconditional no-durable-raw-input contract.

Gateway receives text and routes it to eligible downstream providers. Vercel states Gateway does not retain prompts or outputs, while routing metadata is retained for 30 days. Default routing does not enforce provider ZDR; this adapter explicitly requires it. No real private content should be used before the application's processing-policy gate is satisfied.

Before any provider call, a metadata-only `knowledge:embed-document` or `knowledge:embed-query` audit commits with authorization. Audit failure prevents transmission. Source locks protect the current ready version while its passages are selected. These audits record authorized transmission attempts, not successful delivery or provider retention. Later revocation cannot recall content already transmitted.

## Integration

When enabled, manual portal processing and the scheduled document worker index canonical passages. `search_knowledge_semantic` is registered on MCP only when enabled and discloses external processing and incomplete indexing. Ordinary `search_knowledge` and the portal search form remain keyword based. No caller-supplied model or vector is accepted. Provider failures remain retryable and never silently become successful semantic indexing.

## Verification

On 2026-11-07 the authorized synthetic live smoke reached Gateway using local development OIDC and returned HTTP 403 with a credit-related reason, including one retry. No provider output or semantic-quality acceptance was obtained. The integration is locally verified; live acceptance requires the account owner to resolve Gateway credit/access availability. Do not purchase credits automatically or weaken ZDR to bypass this failure.

`npx vitest run lib/__tests__/emba-embeddings.test.ts` checks disabled/bounded inputs, fixed SDK options, malformed vectors, sanitized errors, missing optional schema, authorization before transmission, actual vector indexing/search in PGlite, and permission revocation during the provider call. These tests mock inference only. A separate synthetic live smoke verifies Gateway authentication, model output, and routing behavior; it must never print input, credentials, raw errors, or full provider responses.

References: [embedding API](https://ai-sdk.dev/docs/ai-sdk-core/embeddings), [Gateway embeddings](https://vercel.com/docs/ai-gateway/modalities/embeddings), [OIDC authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok), [Gateway ZDR](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr), [request logs](https://vercel.com/docs/ai-gateway/observability-and-spend/logs).

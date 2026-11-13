## Why

A seven-person team should be able to join a private group, access its uploaded resources from their existing assistants, and maintain one shared source of context. The current application has substantial permission, document and MCP services but lacks a complete self-service resource-workspace journey and verified hosted assistant acceptance.

## What Changes

- Add a focused Loop workspace experience for group creation, resource upload, invitations, membership requests and assistant connections.
- Support manually supplied text, Markdown and text-based PDFs with cited retrieval and visible processing states.
- Reuse the existing authenticated MCP service, membership checks, exact-group assistant leases and audit services.
- Make document retrieval accessible through the same connector as group discovery; keep private memory separate.
- Prove one real Claude connection before declaring the seven-person pilot ready; test ChatGPT separately rather than inferring compatibility.

## Capabilities

### New Capabilities
- `resource-workspaces`: Self-service private groups, resource ingestion, membership lifecycle and assistant onboarding.

### Modified Capabilities
None of the older specifications are marked complete or replaced. This is a focused delivery slice over the existing EMBA platform and portable group-memory changes.

## Impact

Root Next.js application, `lib/emba` services, additive PostgreSQL migrations, existing MCP routes and deployment runbooks. Reuse the existing Clerk identity/OAuth adapter and database configuration. Do not modify the legacy `web/` application or unrelated board flows. No new conversational UI, external messaging, Canvas integration, billing, automatic intent inference or public directory is required.

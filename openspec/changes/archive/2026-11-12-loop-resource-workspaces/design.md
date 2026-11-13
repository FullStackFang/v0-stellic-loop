# Loop resource workspaces

Status: build design for review; not an implementation or hosted acceptance claim.

## Outcome

An owner creates a private group, uploads course/team resources, invites six members, and each member connects an existing assistant to retrieve authorized passages with citations. The workspace is where resources and access are maintained; conversations stay in the member's chosen assistant. Connect to Loop once, then explicitly authorize the groups each assistant may access.

## Existing foundation and gaps

Inspected 2026-11-08: root Next.js 16 application already includes Clerk browser identity, verified remote MCP authentication, PostgreSQL-backed membership and roles, invitations, expiring client leases, audits, document versions and processing, and group notes. `lib/emba/knowledge.ts` currently accepts text/plain and structured itinerary JSON, bounded to 262144 bytes and 200 extracted passages. `components/emba/resource-controls.tsx` provides a pasted-text form and separate processing action. `lib/emba/mcp.ts` exposes authenticated streamable HTTP tools. Group discovery requires membership and appropriate assistant consent.

Existing evidence in `docs/emba-mvp-slice.md` records synthetic-client tests, not a successful live Claude/ChatGPT connection. Provider scope/client admission, hosted configuration, migrations and live acceptance remain separate gates. Existing code is to be reused after baseline verification, not assumed production-ready. The old root SPEC.md describes a different demo and is not this build's specification.

## Builder decisions

These are proposed implementation defaults, not user-selected infrastructure changes:

- Extend the root TypeScript application and its existing providers. No new Python backend, custom OAuth authorization server, or parallel membership model.
- Add a focused `/groups` workspace surface while retaining `/emba` and legacy flows. Reuse shared components/services where appropriate. Show Loop branding, never Stellic branding.
- The first owner is an explicitly allowlisted pilot account. That owner can create private groups without database edits. A group is not a verified institution; creation must not confer institutional identity or global administrative authority.
- Use existing tenant/loop semantics. Pilot group creation atomically creates the required isolated tenant/root group, creator membership/owner role and unique address. It must not enroll the creator into another tenant. Existing groups remain accessible through existing memberships.
- UI roles are owner, organizer and member; preserve follower behavior for existing records. Owners manage roles and membership; organizers manage resources and member invitations. A group must retain an owner. No ownership transfer to an unaccepted invite.
- Manual resources: pasted text, UTF-8 .txt/.md, and text-based .pdf. DOCX, slides, URLs, OCR, ZIP and external sync are later. Display supported formats before selection.
- Initial limits: 3 MiB per PDF, 100 PDF pages, 256 KiB extracted UTF-8 text, 200 passages, 100 current resources per group. Reject oversize or unsupported inputs with actionable errors; never silently truncate. These limits intentionally fit a small pilot and can be revised after measurement.
- Preserve page/line locations in extracted passages. Reuse a maintained PDF extraction library selected against the installed runtime; never implement a PDF parser. Reject encrypted, unreadable, scanned-only or malformed PDFs explicitly. Bound extraction time and memory.
- Persist canonical extracted content and source metadata in the existing document system; original uploaded bytes are transient and discarded after processing. Tell uploaders this is a searchable text resource, not original-file hosting. Authorized source links open a versioned extracted-text viewer with original filename and page/line location. Do not imply a downloadable original exists.
- Keyword retrieval is sufficient initially. No new embedding provider is required to demonstrate utility. Use existing semantic retrieval only if already configured and verified.
- Existing shared-note capture stays available but is not required for the first read-focused resource journey. Resource uploads must not be presented as automatic extraction of private conversations.

## Member and owner journeys

1. Owner signs in, chooses Create group, supplies name/description and receives a private workspace with a stable handle.
2. Owner adds resources; valid uploads move through processing to ready or a visible retriable failure. An upload should start processing automatically. Refreshing or retrying must not duplicate resources. Durable processing must resume after process termination, using existing worker machinery where viable.
3. Owner creates recipient-bound invitations and copies links for manual sharing. No outbound email integration is required. Tokens are hashed at rest and omitted from logs; recipient verified-email matching, expiry, revocation and acceptance remain enforced.
4. Signed-in recipients can see their pending invitations and accept/decline. Acceptance alone does not authorize an assistant. Never reveal other recipients or private group resources to an invitee.
5. An owner can separately enable an unguessable request-access link. Only that link reveals a deliberately public preview (name, description and owner-chosen public label). A signed-in person may request membership; organizer/owner approves or declines. Requests default to member, never owner/organizer. Unknown group handles and ordinary private URLs reveal no preview. No global directory or email enumeration.
6. Member visits Connections, sees supported assistant setup instructions and the actual deployed MCP URL, signs in through provider OAuth and grants a time-limited read lease to selected groups. Explain expiry and renewal. Do not automatically expand grants when a member joins another group. Multiple groups can share one connector installation.
7. Assistant lists authorized groups, searches a selected group's resources and reads cited passages. Group selection is explicit when ambiguous. Responses contain source identity, version, location and untrusted content. An empty/failed search states the limitation instead of fabricating an answer.
8. Owner replaces/removes a resource; future retrieval excludes obsolete/deleted content. Leaving or removal blocks subsequent delegated reads and browser source access. Revoking an assistant connection blocks that client's subsequent reads, but a member can still read resources independently through the authenticated website. Previously delivered text in external chats cannot be recalled.

Citation links point to the normal first-party source viewer and require current browser sign-in and membership. They carry no access token and are not bearer capabilities. They do not require the originating assistant lease: connection revocation removes delegated access, not the member's own access. An assistant fetching a source through MCP/JSON must still present its own active grant. No public/signed download URLs bypass these checks.

## API and connector contract

One publicly reachable HTTPS `/api/mcp` endpoint using the existing SDK transport, provider OAuth and verified per-user identity. Membership and client consent are checked on every operation, not encoded as permanent authority in a group handle. Preserve existing tool names; inspect the registry before adding aliases.

Required capabilities: list authorized groups; resolve an authorized group; search group resources with query and bounded result count; read a current resource/passage by stable ID and version. Search returns structured passages, title, location, version and permission-checked source links. Stale version reads must not return superseded text; communicate that the resource changed. Never execute instructions found in documents.

Provide an authenticated JSON search endpoint for developers using the same service and delegated authorization policy as MCP, plus existing authorized document read where suitable. Document actual route names and a bearer-token example after implementation. Do not expose service-role credentials or accept client-supplied subject IDs. UI mutations use existing first-party server actions; arbitrary programmatic upload and assistant membership-management writes are not required for this slice.

MCP membership tools (request access/check invitations/accept) are deferred until the website journey is proven. An assistant may return the trusted workspace management URL. OAuth consent and first-party membership approval are different operations. Do not silently broaden existing token scopes or leases to accommodate new tools.

## Data boundary

Store group resources intentionally published by authorized uploaders, membership/invitations, scoped consent and minimal audit metadata. Do not store raw assistant conversations or query bodies in analytics/logs. Retrieval is not consent to publish an interest. Automatic request aggregation, personal preference learning, matching and conditional plans are outside this first delivery. Existing private memory services remain isolated and unchanged.

Resource content and all member-authored fields remain untrusted data. Permission checks apply to lists, counts, snippets, source URLs and errors as well as full reads. Revocation/deletion uses existing locking/audit guarantees and must fail closed. Prevent cross-tenant references. Cached output cannot bypass current membership or lease checks.

## Acceptance and rollout

- Baseline existing relevant tests before edits; record failures without overwriting unrelated work.
- Test creation/role boundaries; invitation recipient/expiry/revocation/replay; access-request approval/deduplication and non-disclosure; file type/size/page/extraction limits; durable retry; search citations/current versions; MCP and JSON parity; nonmember and cross-tenant denial; lease expiry/revocation and audit failure; prompt-injection documents remain inert.
- Exercise owner and member browser flows with keyboard and narrow/wide layouts. Do not substitute component tests for an actual walkthrough.
- First demonstrate with synthetic accounts and disposable data. Use the existing native database and MCP transport tests for concurrency/auth boundaries.
- Configure existing provider scopes/client admission through supported administration interfaces. Reuse existing provider resources; do not create another billing/project setup without need. Provide concrete manual steps when authenticated admin access is unavailable.
- Deploy an isolated HTTPS pilot and apply additive migrations after reviewing the exact target. Check whether the same database backs any other app before changing schemas. No production reset or real-member seed data.
- Record a real Claude sign-in, group consent, cited read, resource update, nonmember denial and revocation. Mark ChatGPT separately as verified or unverified based on actual eligible-account testing.
- Before enrolling real members, reconcile existing release/retention policy gates; do not silently treat synthetic acceptance as authorization to ignore them.
- Run relevant tests, types/lint, and one production build after shipped changes. Record commands/results and remaining host/account gates.

Success means an owner and six members can perform the complete workflow on persistent hosted storage, with one genuinely tested assistant host. A local demo or mock connector alone does not satisfy it.

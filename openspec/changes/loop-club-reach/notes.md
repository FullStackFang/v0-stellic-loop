# Notes: in-chat cards over MCP Apps (research)

Read on 2026-11-13 and 2026-11-14 from the primary documents listed below. Nothing here is from memory. Where a document did not answer a question, the gap is listed under "Open or unverified".

## Things that conflict with the design as described

1. The current `@modelcontextprotocol/ext-apps` (2.0.4) does not work with `@modelcontextprotocol/sdk` 1.32.2. It needs the split 2.x packages. Only the 1.x line (last: 1.7.5) pairs with our SDK. See "Sources read" and "Declaring a card".
2. `Mcp-Session-Id` is not a usable session identifier. Our server is stateless and never issues one, and the newest MCP revision (2026-07-28) removes the header. See "Sessions and host identity".
3. A stateless server sees `clientInfo` and client capabilities only on the `initialize` request, not on `tools/call`. Per-request logging of host name and version needs another source. See "Sessions and host identity" and "Detecting card support".
4. No host tells the server whether a `tools/call` came from the model or from the card. See "Telling a card call from a model call".
5. ChatGPT renamed the feature. There is no "connector" or "developer mode" step now: the member adds a "custom MCP server" under "Plugins" and it becomes a "plugin". OpenAI's help page documents this for Business and Enterprise/Edu only, on the web only. See "Connecting: plans and steps per assistant".
6. No `openai/*` key and no `window.openai` call is required for the card. All are documented as optional or compatibility aliases. See "ChatGPT".

## Sources read

| Source | URL | Version or date shown |
| - | - | - |
| MCP Apps spec, stable | https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx | "Status: Stable (2026-01-26)", SEP-1865 |
| MCP Apps spec, draft | https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx | draft on `main` |
| ext-apps README, docs (`overview.md`, `patterns.md`, `csp-cors.md`, `testing-mcp-apps.md`, `migrate-to-2.md`, `migrate_from_openai_apps.md`), `src/app.ts`, `src/spec.types.ts`, `src/server/index.ts`, `examples/basic-host`, `examples/basic-server-vanillajs` | https://github.com/modelcontextprotocol/ext-apps (branch `main`, and tag `v1.7.5` for the 1.x helpers) | `LATEST_PROTOCOL_VERSION = "2026-01-26"` |
| npm registry | https://registry.npmjs.org/@modelcontextprotocol/ext-apps | dist-tag `latest` = 2.0.4 (2026-10-27); `release-2.0` = 2.0.3; 2.1.0 is published (2026-10-27) but is not tagged `latest`; last 1.x = 1.7.5 (2026-07-23) |
| MCP site: MCP Apps overview, extensions overview, extension support matrix | https://modelcontextprotocol.io/extensions/apps/overview , https://modelcontextprotocol.io/extensions/overview , https://modelcontextprotocol.io/extensions/client-matrix | current |
| MCP spec changelog and transports | https://modelcontextprotocol.io/specification/2026-07-28/changelog , https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http , https://modelcontextprotocol.io/specification/2025-11-25/basic/transports | revisions 2026-07-28 and 2025-11-25 |
| MCP Inspector, app review recipe | https://github.com/modelcontextprotocol/inspector/blob/main/docs/mcp-app-review.md | branch `main` |
| Claude docs: MCP Apps getting started, quickstart, design guidelines, display modes, send messages, transparent theming, instance supersession, troubleshooting | https://claude.com/docs/connectors/building/mcp-apps/getting-started (and sibling pages; each has a `.md` twin) | quickstart says "verified with `@modelcontextprotocol/ext-apps@1.7.5`" |
| Claude docs: build an MCP server, test your connector, add a connector that isn't in the directory, directory vs custom | https://claude.com/docs/connectors/building/index , https://claude.com/docs/connectors/building/testing , https://claude.com/docs/connectors/custom/add-unlisted , https://claude.com/docs/connectors/building/directory-vs-custom | current |
| Claude help: Use interactive connectors in Claude | https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude | "Updated this week" |
| OpenAI docs (combined export) | https://developers.openai.com/plugins/llms-full.txt (pages: Add UI to your MCP server, MCP server and UI quickstart, Reference, Connect and test your plugin, Troubleshooting, Plugin Extensions, Quickstart) | current. `developers.openai.com/apps-sdk/mcp-apps-in-chatgpt/` now serves the "Add UI to your MCP server" page |
| OpenAI docs: Add custom MCP server | https://developers.openai.com/api/docs/guides/custom-mcp-server | current |
| OpenAI help: Connecting custom MCP servers in ChatGPT | https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt | "Updated: 17 days ago" |
| OpenAI MCP extensions spec | https://github.com/openai/mcp-extensions/blob/main/docs/spec.md | branch `main` |
| This repo (read only) | `package.json`, `lib/emba/mcp.ts`, `node_modules/@modelcontextprotocol/sdk` | sdk 1.32.2 (`LATEST_PROTOCOL_VERSION = '2025-11-25'`), zod 4.6.7, next 16.4.2 |

### Package versions and peer dependencies

- `@modelcontextprotocol/ext-apps@2.0.4` (latest): peers `@modelcontextprotocol/core ^2.0.0`, `@modelcontextprotocol/client ^2.0.0`, `@modelcontextprotocol/server ^2.0.0` (optional), `zod ^4.2.0`, optional `react`/`react-dom`. `migrate-to-2.md` says: "`@modelcontextprotocol/sdk@^1` is replaced by the split 2.x packages" and "the two SDKs share no classes or types". So 2.x cannot be used with our `@modelcontextprotocol/sdk` 1.32.2.
- `@modelcontextprotocol/ext-apps@1.7.5`: peers `@modelcontextprotocol/sdk ^1.29.0`, `zod ^3.25.0 || ^4.0.0`, optional `react`/`react-dom`. This works with sdk 1.32.2 and zod 4.6.7. Claude's quickstart installs exactly this line: `npm install @modelcontextprotocol/ext-apps@^1`, "the one that pairs with the `1.x` MCP SDK".
- The wire protocol is the same in both lines. `migrate-to-2.md`: "The `ui/*` messages exchanged over the iframe channel are byte-identical to 1.x. A 2.x View runs in a 1.x host and a 2.x host renders 1.x Views."
- The package is not needed at all for our plan. The server helpers only write `_meta` and a mime type, and the view bridge can be written by hand (see "The bridge").

## Declaring a card

### On the tool

The tool descriptor carries `_meta.ui`:

```json
"_meta": { "ui": { "resourceUri": "ui://loop/card.html", "visibility": ["model", "app"] } }
```

- `_meta.ui.resourceUri`: "URI of UI resource for rendering tool results".
- `_meta.ui.visibility`: array of `"model"` and/or `"app"`. "Default: `["model", "app"]`".
- The flat key `_meta["ui/resourceUri"]` is deprecated: "Use `_meta.ui.resourceUri` instead. Will be removed before GA." The SDK helper `registerAppTool` still writes both keys (Claude quickstart output shows `"_meta":{"ui":{"resourceUri":"ui://quickstart/dice"},"ui/resourceUri":"ui://quickstart/dice"}`).
- With plain `McpServer.registerTool` the same `_meta` object can be passed in the tool config. OpenAI's own example does this (`server.registerTool("render_dice_widget", { ..., _meta: { ui: { resourceUri: TEMPLATE_URI } } })`).
- Spec behaviour: "If host does not support MCP Apps, tool behaves as standard tool (text-only fallback)". "Tools MUST return meaningful content array even when UI is available".
- Tool result fields, per spec: `content` is "Text representation for model context and text-only hosts"; `structuredContent` is "Structured data optimized for UI rendering"; `_meta` is "Additional metadata ... not intended for model context".

### The `ui://` resource

- URI "MUST start with `ui://` scheme".
- `mimeType` "MUST be `text/html;profile=mcp-app`". The SDK exports it as `RESOURCE_MIME_TYPE`.
- Content is `text` (string) or `blob` (base64) and "MUST be valid HTML5 document".
- The host "MUST use `resources/read` to fetch the referenced resource URI" and "MAY prefetch and cache UI resource content". Servers "MAY omit UI-only resources from `resources/list`".
- Resource metadata is `_meta.ui` with these fields:
  - `csp`: `connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains` (string arrays of origins).
  - `permissions`: `camera`, `microphone`, `geolocation`, `clipboardWrite` (each `{}`).
  - `domain`: a dedicated sandbox origin; "Host-dependent" format.
  - `prefersBorder`: boolean; "Specifying an explicit value for this is recommended because hosts' defaults may vary."
- Where to put it: the stable spec shows `_meta.ui` on the content item returned by `resources/read`. `csp-cors.md` says "`_meta.ui.csp` and `_meta.ui.domain` are set in the `contents[]` objects returned by the resource read callback, not in `registerAppResource()`'s config object." The draft spec adds that it may also be on the `resources/list` entry, and "the content-item value takes precedence".
- Default policy when `ui.csp` is omitted (spec):

  ```
  default-src 'none';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  media-src 'self' data:;
  connect-src 'none';
  ```

  Inline scripts and inline styles are allowed by default, and `data:` images are allowed. A single self-contained page therefore needs no `csp` entry at all. It cannot fetch anything: `connect-src 'none'`. All data must arrive through the bridge.
- OpenAI advice: "Treat the resource URI as a cache key. When you make a breaking change to the HTML, JavaScript, or CSS, publish a new URI and update every tool that references it."

## The bridge

Transport: "MCP Apps uses JSON-RPC 2.0 over `postMessage` for iframe-host communication." The view posts to `window.parent`. On web hosts a sandbox proxy iframe sits between host and view and forwards every message whose method does not start with `ui/notifications/sandbox-`.

### Handshake

1. View sends request `ui/initialize` with params `{ appInfo: { name, version }, appCapabilities: {}, protocolVersion: "2026-01-26" }`. (`src/spec.types.ts`: `McpUiInitializeRequest`; `LATEST_PROTOCOL_VERSION = "2026-01-26"`.)
2. Host replies with `McpUiInitializeResult`: `{ protocolVersion, hostInfo: { name, version }, hostCapabilities, hostContext }`.
3. View sends notification `ui/notifications/initialized`.

"The Host MUST NOT send any request or notification to the View before it receives an `initialized` notification."

Note: the spec's short "you don't need an SDK" snippet calls `sendRequest("initialize", { capabilities, clientInfo, protocolVersion })`. That snippet does not match the rest of the spec or the SDK. The message the SDK actually sends, and that OpenAI's hand-written example sends, is `ui/initialize` with `appInfo` and `appCapabilities`.

### Receiving data (host to view, notifications)

- `ui/notifications/tool-input`: `params: { arguments }`. Sent "at most once" and "required before sending `ui/notifications/tool-result`".
- `ui/notifications/tool-input-partial`: optional streaming of arguments; a view "MAY ignore these notifications entirely".
- `ui/notifications/tool-result`: `params` is the standard `CallToolResult` (`content`, `structuredContent`, `_meta`, `isError`).
- `ui/notifications/tool-cancelled`: `params: { reason }`.
- `ui/notifications/host-context-changed`: `params: Partial<HostContext>`; "the View SHOULD merge received fields with its current context state".
- `ui/resource-teardown`: this is a request from the host (has an `id`); the view answers with `result: {}`.

### Calling a server tool (view to host, request)

- `tools/call` with `params: { name, arguments }`. The result comes back as the JSON-RPC response to that request and is a `CallToolResult`. Requires host capability `hostCapabilities.serverTools`.
- The host "MUST reject `tools/call` requests from apps for tools that don't include `"app"` in visibility".
- Also available: `resources/read`, `notifications/message` (log), `ping`.

### Theme and style

- `hostContext.theme`: `"light" | "dark"`.
- `hostContext.styles.variables`: a record of CSS custom properties. The standardized names (stable spec, `McpUiStyleVariableKey`) are:
  - Background: `--color-background-primary`, `-secondary`, `-tertiary`, `-inverse`, `-ghost`, `-info`, `-danger`, `-success`, `-warning`, `-disabled`.
  - Text: `--color-text-primary`, `-secondary`, `-tertiary`, `-inverse`, `-info`, `-danger`, `-success`, `-warning`, `-disabled`, `-ghost`.
  - Border: `--color-border-primary`, `-secondary`, `-tertiary`, `-inverse`, `-ghost`, `-info`, `-danger`, `-success`, `-warning`, `-disabled`.
  - Ring: `--color-ring-primary`, `-secondary`, `-inverse`, `-info`, `-danger`, `-success`, `-warning`.
  - Font family: `--font-sans`, `--font-mono`.
  - Font weight: `--font-weight-normal`, `-medium`, `-semibold`, `-bold`.
  - Text size and line height: `--font-text-{xs,sm,md,lg}-size`, `--font-text-{xs,sm,md,lg}-line-height`.
  - Heading size and line height: `--font-heading-{xs,sm,md,lg,xl,2xl,3xl}-size`, `--font-heading-{...}-line-height`.
  - Radius: `--border-radius-{xs,sm,md,lg,xl,full}`.
  - Border width: `--border-width-regular`.
  - Shadow: `--shadow-hairline`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`.
- `hostContext.styles.css.fonts`: CSS text with `@font-face` or `@import` rules for the host font.
- Hosts "can provide any subset of standardized variables, or not pass `styles` at all". Views "should set default fallback values". Hosts "should use the CSS `light-dark()` function", so the page needs `<meta name="color-scheme" content="light dark">` for those values to resolve (Claude theming page).
- Other `hostContext` fields: `toolInfo` (`id`, `tool`), `displayMode`, `availableDisplayModes`, `containerDimensions` (`height` or `maxHeight`, `width` or `maxWidth`), `locale`, `timeZone`, `userAgent`, `platform` (`"web" | "desktop" | "mobile"`), `deviceCapabilities` (`touch`, `hover`), `safeAreaInsets`.

### Size

- `ui/notifications/size-changed` (view to host): `params: { width, height }` in pixels. "The View SHOULD send this notification when rendered content body size changes (e.g. using ResizeObserver API)". Hosts with flexible dimensions "MUST listen" for it. The SDK does this automatically (`autoResize`, default on); a hand-written bridge must do it itself.

### Talking to the model

- `ui/update-model-context` (request): `params: { content?: ContentBlock[], structuredContent?: Record<string, unknown> }`. "Each request overwrites the previous context sent by the View." The host "MAY defer sending the context to the model until the next user message".
- `ui/message` (request): `params: { role: "user", content: { type: "text", text } }` in the stable spec. The SDK call is `app.sendMessage({ role: "user", content: [{ type: "text", text }] })` with `content` as an array. The spec text and the SDK shape differ here; follow the SDK shape and test it.
- `ui/open-link` (request): `params: { url }`.
- `ui/request-display-mode` (request): `params: { mode }`, result `{ mode }`.

### Is a hand-written bridge feasible and sanctioned?

Yes on both counts.

- The spec says: "Note that you don't need an SDK to 'talk MCP' with the host" and shows `window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, '*')`.
- OpenAI's "MCP server and UI quickstart" builds exactly this: "a basic to-do workflow with UI contained in a single HTML file that keeps the markup, CSS, and JavaScript together", with a hand-written `rpcRequest` / `rpcNotify` pair, `ui/initialize` with `{ appInfo, appCapabilities, protocolVersion: "2026-01-26" }`, `ui/notifications/initialized`, `tools/call`, and a listener for `ui/notifications/tool-result`. It says "since we're using vanilla HTML, no build step is required." That example is about 60 lines of bridge code. It filters incoming messages with `event.source !== window.parent`.
- A minimal bridge for our card needs: request/response matching by `id`; the handshake; handlers for `tool-input`, `tool-result`, `host-context-changed`; an answer to `ui/resource-teardown`; `tools/call`; and a `ResizeObserver` that sends `size-changed`. About 100 lines is realistic.
- Claude's pages only show the SDK (`App`, `app.connect()`), never a hand-written bridge. They do not forbid one, and the wire messages are the same.

Official single-file patterns in the examples:

- `examples/basic-server-vanillajs/vite.config.ts` uses `vite-plugin-singlefile` (`plugins: [viteSingleFile()]`) to inline script and style into one HTML file. This is the pattern the ext-apps examples use.
- OpenAI's richer example bundles the view with `esbuild` and inlines the output into a `<script type="module">` in an HTML string.
- The package ships `./app-with-deps` (`dist/src/app-with-deps.js`), a prebuilt bundle of the `App` class with its dependencies. Claude's quickstart imports it from `https://unpkg.com/@modelcontextprotocol/ext-apps@1.7.5/dist/src/app-with-deps.js` and must then declare `csp: { resourceDomains: ['https://unpkg.com'] }`. That breaks the "nothing loaded from outside" rule. Claude's page says: "For production, serve the client script from your own origin, or bundle it into the HTML".

## Telling a card call from a model call

- The spec does not define any marker. Neither the stable nor the draft spec has a field on `tools/call` that says who started it. The host proxies the view's `tools/call` to the server as an ordinary `tools/call`.
- Claude's docs do not describe any such marker either. They note only that "MCP tool calls are proxied through Claude's backend".
- OpenAI's docs describe `window.openai.callTool` as "Invoke another MCP tool from the widget (mirrors model-initiated calls)". The `_meta` fields ChatGPT sends on tool calls are `openai/locale`, `openai/userAgent`, `openai/userLocation`, `openai/subject`, `openai/session`, `openai/organization`. None says "from the widget". `_meta["openai/widgetSessionId"]` is listed as "Tool result `_meta` (from host)", a value given to the widget, not a request field sent to the server.

So the server has to arrange the distinction itself. Two ways, both built from documented parts:

1. An app-only tool. Register card-only variants (for example `card_answer`, `card_interested`) with `_meta.ui.visibility: ["app"]`. Spec: "Host MUST NOT include tools in the agent's tool list when their visibility does not include `"model"`". `patterns.md` recommends this for "UI-driven actions like updating server-side state". A call to that tool name is then, on a compliant host, a card call. Limit: a client that does not implement MCP Apps (Claude Code, for example) does not read `visibility` and will show the tool to the model. Treat the tool name as a strong hint, not proof.
2. An argument the card adds. The card passes an extra argument (for example `via: "card"`) to the shared `answer` / `interested` tools. Limit: the argument is in the tool's input schema, which the model also sees, so the model could send it too. It is the weaker of the two.

Either way this is a logging signal. It must not feed an authorization decision.

Related: because ChatGPT's reference keeps `_meta["openai/widgetAccessible"]` (default `false`) only as a "compatibility field used by existing UI integrations; prefer `_meta.ui.visibility` + `tools/call`", the standard `visibility` array is the documented way to make a tool callable from the card in ChatGPT.

## Detecting card support

- Hosts advertise support in client capabilities under the extension id `io.modelcontextprotocol/ui`:

  ```json
  "capabilities": { "extensions": { "io.modelcontextprotocol/ui": { "mimeTypes": ["text/html;profile=mcp-app"] } } }
  ```

- In protocol revisions up to 2025-11-25 this is sent once, in the `initialize` request. The SDK helper is `getUiCapability(clientCapabilities)` from `@modelcontextprotocol/ext-apps/server`; with the plain SDK it is `server.server.getClientCapabilities()?.extensions?.["io.modelcontextprotocol/ui"]`. Our SDK's capability types already include `extensions`.
- In revision 2026-07-28 there is no `initialize`. "Every request now carries its protocol version and client capabilities in `_meta` (`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientCapabilities`)". The extensions overview shows `extensions["io.modelcontextprotocol/ui"]` inside `_meta["io.modelcontextprotocol/clientCapabilities"]` on a `tools/call`.
- For our stateless server this matters. `lib/emba/mcp.ts` builds a new `McpServer` and a new transport per HTTP request (`sessionIdGenerator: undefined`). `getClientCapabilities()` is only filled on the instance that handles `initialize`. On the separate requests for `tools/list` and `tools/call` it is `undefined`. Our SDK (1.32.2) supports protocol versions up to `2025-11-25`, so it does not read per-request capability `_meta`. Result: with the current setup the server cannot decide per `tools/list` whether the host renders cards, unless it stores what it saw at `initialize` (for example keyed by access token) and reads it back.
- The spec's recommended conditional registration ("Servers SHOULD check client capabilities before registering UI-enabled tools") assumes the server can see capabilities when it lists tools. The spec also guarantees the fallback: a host without MCP Apps treats the tool as a standard tool. So declaring `_meta.ui.resourceUri` unconditionally and always returning useful `content` is safe and needs no detection.

## Sessions and host identity

### `Mcp-Session-Id`

- Revision 2025-11-25: "A server using the Streamable HTTP transport **MAY** assign a session ID at initialization time, by including it in an `MCP-Session-Id` header". If it does, clients "MUST include it" on later requests. The id is minted by the server, not the client.
- A stateless server (`sessionIdGenerator: undefined`) issues none. Our test `lib/__tests__/emba-adapters.test.ts` asserts `initialized.headers.get('mcp-session-id')` is null. So there is no session header to log today.
- Revision 2026-07-28: "Remove protocol-level sessions and the `Mcp-Session-Id` header from the Streamable HTTP transport." A server on that revision receiving the header should "ignore it, and do not mint or echo session IDs." "Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments".
- Conclusion: do not build logging on `Mcp-Session-Id`. Turning sessions on would also make the server stateful, which the newest revision moves away from.

### What can stand in as a session identifier

- ChatGPT sends `_meta["openai/session"]` on tool calls: "Anonymized conversation id for correlating tool calls within the same ChatGPT session." It also sends `_meta["openai/subject"]` ("Anonymized user id") and, when available, `_meta["openai/organization"]`. These are per conversation and per user, not per connection.
- Claude's docs describe no equivalent field.
- The spec-approved portable option is a server-minted handle: return an id in the tool result (in `structuredContent` or `_meta`) and have the card pass it back as an argument on its `tools/call`. This ties a card call to the model call that mounted the card on any host. In the view, `hostContext.toolInfo.id` is the "JSON-RPC id of the tools/call request" that created the view, but that value is only known to the view and host, and hosts are not required to send it.

### Host name and version (`clientInfo`)

- Up to 2025-11-25, `clientInfo` is in the `initialize` request only. A stateless server sees it on that one HTTP request and not on later `tools/call` requests.
- In 2026-07-28, "Clients SHOULD identify themselves on each request (`io.modelcontextprotocol/clientInfo`)" in `_meta`.
- Claude: "Claude identifies itself in the MCP `initialize` handshake through `clientInfo`, but the exact value depends on the surface and the request path. You may see `"name": "claude-ai"`, `"name": "Anthropic"`, sometimes with a service suffix, or `"name": "claude-code"`." "Don't gate behavior on an exact `name` or `version` string". "Use `clientInfo` for telemetry and coarse feature detection only. It's also unauthenticated".
- ChatGPT: `_meta["openai/userAgent"]` on tool calls is "optional, best-effort metadata rather than a stable way to detect which host surface is calling your server." The presence of any `openai/*` key in request `_meta` is a practical per-request sign of ChatGPT; that inference is ours, not a documented contract.
- Inside the card, the host names itself in the `ui/initialize` result: `hostInfo: { name, version }` (spec example: `"claude-desktop"`). The card could pass that back as an argument if per-call host identity is wanted in logs.

## Claude

- Surfaces that render cards: "Interactive connectors are available for all users on Claude, Cowork, Claude Desktop, and Claude for iOS/Android." Claude Code does not: "Claude Code calls the tool as text and doesn't render the UI." The MCP support matrix marks Claude (web) and Claude Desktop for MCP Apps and leaves Claude Code blank.
- Team and Enterprise owners can turn off the tool calls that render interactive views; "text-based tool functionality continues to work normally."
- Custom connectors are reached from Anthropic's servers: "Claude connects to it from Anthropic's infrastructure over the internet, so a `localhost` address isn't reachable".
- Permission: "Claude asks for permission to display the app. Click **Allow once**, or **Always allow**".
- Display modes: "Claude offers `inline` and `fullscreen`." The side panel "is available to a limited set of organizations". In `inline` mode `hostContext.containerDimensions` has `width` and `maxHeight`.
- Inline card constraints (design guidelines): "Height auto-fits to content, with no nested scrolling"; "At most 2 actions, placed at the bottom of the card"; "At most 4-5 data points"; "No drill-ins, breadcrumbs, or multiple views"; "No menus or popovers, only visible controls". On mobile "The host also caps inline height and clips content that exceeds it".
- In-card versus chat: "Confirming or executing a prepared action, such as 'Mark complete,' 'Send,' or 'Save'" belongs in the app; "Text entry and freeform input" belongs in the chat input.
- CSP: "All external origins are blocked by default." "If you set `baseUriDomains`, Claude ignores it". Claude's font file origin is `https://assets.claude.ai`; using `styles.css.fonts` needs that origin in `resourceDomains`. A fully self-contained card should skip the host font file and use `var(--font-sans)` with a system fallback.
- `prefersBorder`: "If you don't set it, content renders borderless on web and bordered on mobile."
- Theme: every frame around the view is transparent; set `html, body { background: transparent }` and `<meta name="color-scheme" content="light dark" />`.
- Mobile: rendered in "a native WebView, `WKWebView` on iOS and `WebView` on Android, rather than a sandboxed iframe". "users must add a connector on web or desktop before it appears on mobile."
- `ui.domain`: optional. Only needed for a stable origin (own OAuth flow, CORS allowlists). Format is the first 32 hex characters of SHA-256 of the connector URL plus `.claudemcpcontent.com`. Not needed for a card that makes no network requests.
- Limits: "Maximum tool result size ~150,000 characters"; "Tool call timeout 240 seconds per tool call". Above ~150,000 characters with the code sandbox active, the card "receives a pointer to the stored file" and "never hydrates".
- `ui/message` limits: text blocks only, "at most 8,000 characters", sent on a user action, and the user must agree ("Asks you to allow the message" or "Places the text in your message box, ready to send").
- Several live copies: "Each time Claude calls a tool that renders an MCP App, Claude mounts a separate iframe in the conversation. No host API unmounts earlier instances". Older cards stay clickable. For a card with write buttons this means stale cards can still send `answer` / `interested`; the server must stay the source of truth and treat repeats safely. Claude documents a `BroadcastChannel` pattern to disable older copies.
- Not supported by Claude's MCP client: "Resource subscriptions", "Sampling", "Advanced or draft capabilities".
- Text-only fallback detail: in Claude Code, when a tool returns `structuredContent`, "the `tool_result` Claude receives is that JSON object as a string ... rather than your `content` text." So `structuredContent` must be readable by a model on its own, not only by the card.
- Debugging: Claude Desktop, "Help > Troubleshooting" then "Enable Developer Mode", then `Ctrl+Shift+I` on Windows; the card is "an iframe nested inside another iframe". The most common fault is "Tool call appears but the app is invisible", caused by a missing handshake or zero height.

## ChatGPT

- Standard support: "ChatGPT implements the open MCP Apps standard for UI returned by an MCP server." For new UI: "Declare the UI resource with `_meta.ui.resourceUri`" and "Use the `ui/*` JSON-RPC bridge over `postMessage` for initialization, notifications, tool calls, messages, and model-visible context." Resource mime type: `text/html;profile=mcp-app`.
- Compatibility keys, all optional:

  | Standard | ChatGPT alias | Status in OpenAI's reference |
  | - | - | - |
  | `_meta.ui.resourceUri` | `_meta["openai/outputTemplate"]` | "OpenAI-specific optional/compatibility alias" |
  | `_meta.ui.visibility` | `_meta["openai/widgetAccessible"]`, `_meta["openai/visibility"]` | "compatibility field used by existing UI integrations; prefer `_meta.ui.visibility`" |
  | `_meta.ui.prefersBorder` | `_meta["openai/widgetPrefersBorder"]` | "compatibility alias" |
  | `_meta.ui.csp` | `_meta["openai/widgetCSP"]` | "Legacy ChatGPT compatibility key" |
  | `_meta.ui.domain` | `_meta["openai/widgetDomain"]` | "compatibility alias" |
  | `ui/notifications/tool-input` | `window.openai.toolInput` | alias |
  | `ui/notifications/tool-result` | `window.openai.toolOutput` | alias |
  | `tools/call` | `window.openai.callTool` | alias |
  | `ui/message` | `window.openai.sendFollowUpMessage` | alias |

  "The compatibility aliases remain available for existing integrations. New UI should use the shared fields and bridge methods". "OpenAI extensions are optional and live in `window.openai`".
- The one place an `openai/*` key is still required is outside our card's needs: "`_meta.ui.csp` does not support `redirect_domains` for `window.openai.openExternal(...)` links. To allowlist redirect targets, you must still set `_meta["openai/widgetCSP"].redirect_domains`." Our card opens no external links through `window.openai`.
- `_meta.ui.domain` is "required when submitting a plugin with UI"; it "Defaults to `https://web-sandbox.oaiusercontent.com`". Not needed for a custom, unsubmitted server.
- Optional ChatGPT-only extras that have no standard equivalent: `_meta["openai/toolInvocation/invoking"]` and `_meta["openai/toolInvocation/invoked"]` (status text, 64 characters or fewer), `_meta["openai/widgetDescription"]`, `_meta["openai/ui"].availableDisplayModes`, `window.openai.widgetState` / `setWidgetState`, `requestModal`, `requestClose`, file helpers.
- What the model sees: `structuredContent` is "Surfaced to the model and the component", `content` is "Surfaced to the model and the component", and result `_meta` is "Delivered only to the component. Hidden from the model." For `toolOutput`: "Keep fields concise; the model reads them verbatim."
- Write tools: "Tools without this hint [`readOnlyHint`] are treated as write actions" and "Write actions by default require confirmation." The reference lists `readOnlyHint`, `destructiveHint`, `openWorldHint` as "Required" annotations.
- Approval and the card: "ChatGPT does not load approval-gated arguments into widget values before approval; instead, the host delivers them through `ui/notifications/tool-input` once the user approves the call."
- OpenAI recommends splitting data tools from render tools: "If you attach a widget template to every tool call, ChatGPT can re-render your iframe too often." "Only the render tool should include `_meta.ui.resourceUri`." and "Let the UI call data tools directly for local interactions". This is advice, not a requirement, and it differs from our plan to attach the card to four tool results.
- Display modes named: inline, fullscreen, picture-in-picture ("On mobile, picture-in-picture may be presented as fullscreen").
- Storage: "Avoid `localStorage` for core state."
- Request `_meta` from ChatGPT: `openai/locale` (initialize and tool calls), `openai/userAgent`, `openai/userLocation`, `openai/subject`, `openai/session`, `openai/organization` (tool calls).
- Transport: "Supported MCP protocols: SSE and streaming HTTP." OpenAI's own example server runs `sessionIdGenerator: undefined, // stateless mode`, so a stateless server is an expected shape.
- Custom MCP servers: "Use ChatGPT on the web." Help FAQ: "Can I connect custom MCP servers on mobile? No - web only."

### Differences between Claude and ChatGPT that affect this card

| Topic | Claude | ChatGPT |
| - | - | - |
| Standard keys and bridge | Supported; docs show only the SDK | Supported; docs show a hand-written bridge |
| Host-specific keys needed | None for our card | None for our card |
| `structuredContent` and the model | Spec says it is for the UI; Claude Code passes it to the model as a JSON string | "Surfaced to the model and the component"; "the model reads them verbatim" |
| Data hidden from the model | Spec: result `_meta` | Result `_meta`, "Delivered only to the component" |
| Display modes | `inline`, `fullscreen` (side panel limited) | inline, fullscreen, picture-in-picture |
| Default border | Borderless on web, bordered on mobile | Not stated; `prefersBorder` is a "hint" |
| `ui.domain` format | `{sha256-32hex}.claudemcpcontent.com` | An origin such as `https://example.com`; default `https://web-sandbox.oaiusercontent.com` |
| `baseUriDomains` | Ignored | Not listed among supported `csp` fields |
| Card-sent chat message | `ui/message`, 8,000 characters, user must agree | `ui/message`; limits not documented |
| Session id in requests | None documented | `_meta["openai/session"]` (conversation), `_meta["openai/subject"]` (user) |
| `clientInfo.name` | Varies: `claude-ai`, `Anthropic`, `claude-code` | Not documented |
| Write-tool confirmation | User approves tool calls; "Always allow" exists | Tools without `readOnlyHint` need confirmation by default |
| Several cards in one conversation | Each call mounts a new iframe; old ones stay live | Re-render risk noted; widget state is per instance |
| Mobile | Renders in a WebView; connector must be added on web or desktop first | Custom MCP servers are "web only" |
| Coding-agent surface | Claude Code: text only | Codex: the UI docs describe ChatGPT only |
| Tool result size | ~150,000 characters | Not documented |

## Testing locally

- basic-host (the reference host in the ext-apps repo). From `docs/testing-mcp-apps.md`:

  ```bash
  git clone https://github.com/modelcontextprotocol/ext-apps.git
  cd ext-apps
  npm install
  cd examples/basic-host
  SERVERS='["http://localhost:3001/mcp"]' npm start
  ```

  Then open `http://localhost:8080`, pick the server and a tool, enter the input as JSON, and click "Call Tool". The host runs on port 8080 and its sandbox proxy on 8081. Panels show "Tool Input", "Tool Result", "Messages", and "Model Context"; the browser console logs with a `[HOST]` prefix. The root `npm install` builds the package against the 2.x SDK; that is fine because the iframe wire protocol is the same for 1.x and 2.x. This is a clone outside our repo, so it installs nothing into Loop.
- MCP Inspector. `npx @modelcontextprotocol/inspector --cli http://localhost:3000/mcp --transport http --method tools/list` lists tools. The Inspector's app recipe adds `--app-info` to `tools/call` or `tools/list`, which prints `hasApp`, `resourceUri`, `csp`, `permissions`, `prefersBorder`, `resourceMimeType`, and exits 2 with `no_app` when a tool has no card. The web Inspector has an "Apps" tab that renders the card (`--web`, ports 6274 and 6275). The MCP support matrix lists Inspector support for MCP Apps as "Partial".
- curl. Claude's quickstart checks the two server halves with plain POSTs: `tools/list` should show `_meta.ui.resourceUri` on the tool, and `resources/read` with `{"uri":"ui://..."}` should return `mimeType` `text/html;profile=mcp-app` and the HTML as `text`. Both need `Accept: application/json, text/event-stream`.
- Real hosts. Both vendors say to tunnel a local server: `npx cloudflared tunnel --url http://localhost:3001` (ext-apps and Claude docs) or `ngrok http <port>` (OpenAI docs), then add the tunnel URL plus `/mcp`. Claude: "There is no separate staging environment, so you test in production." ChatGPT: "Refresh the plugin connection after each change to the MCP server", and the API Playground ("Tools → Add → MCP Server") shows raw request and response logs.

## Connecting: plans and steps per assistant

### Claude

- Name of the feature: a "custom connector" (a remote MCP server added by URL). Cards are called "interactive connectors" in the help centre and "MCP Apps" in the developer docs.
- Plans: adding a connector by URL "Works in Free, Pro, Max, Ultra, Team, and Enterprise plans". "On the Free plan, you can add one custom connector."
- Steps on Free, Pro, Max, or Ultra (quoted labels):
  1. "Go to **Customize > Connectors**."
  2. "Select **Add**, then **Add custom connector**."
  3. "Enter a name for the connector and the remote MCP server URL, then click **Continue**."
  4. Authentication: keep the options marked "**Detected**". The choices are "**Sign in now**", "**Sign in when needed**", "**No sign-in**".
  5. "Click **Add**."
  6. "If the connector shows **Connect**, click it and sign in."
- Team and Enterprise: "an Owner adds the connector for the organization, and members then connect with their own account." Owner path: "**Organization settings > Connectors**", "Select **Add**, then **Custom**", choose "**Web**" if asked. Member path: "**Customize > Connectors**", find the connector with the "**Custom**" label, "Click **Connect**".
- Using it in a chat: "Click the **+** button in your chat interface and select **Connectors**, then turn each connector on or off for that conversation."
- OAuth redirect to allow: `https://claude.ai/api/mcp/auth_callback`.
- Mobile: add on web or desktop first; it then appears on mobile.

### ChatGPT

- Name of the feature: "Add custom MCP server", found under "Plugins". The result is a "plugin". The help page: "In the current Plugins experience, add a custom MCP server directly from Plugins. You don't need to turn on Developer Mode first."
- Plans, as documented: "Custom MCP server connections and full MCP support are available for ChatGPT Business and Enterprise/Edu customers on ChatGPT web." Business: "Only admins and owners can create and publish plugins for custom MCP servers". Enterprise/Edu: admins and owners, plus members granted the permission "Create plugins with MCPs" by role-based access control. The same page's FAQ says: "Pro users can build apps using the Apps SDK. Full MCP is only available to Business and Enterprise/Edu users, currently. Pro users can connect custom MCP servers with read/fetch permissions."
- Steps (developer guide and help page agree):
  1. "Go to ChatGPT Plugins" (`https://chatgpt.com/plugins`).
  2. "Select the plus button, then **Add custom MCP server**."
  3. "Enter a name and, optionally, a description. Under **Connection**, enter your **Server URL**".
  4. "Configure authentication for your server." Options: "**OAuth**, **No authentication**, and **OAuth or no authentication**".
  5. "Review the risk warning and select **I understand and want to continue**."
  6. "Select **Create as a plugin**."
  7. Install it: open "your personal plugins" (`https://chatgpt.com/plugins?view=personal`), "Open the plugin and select the plus button to install it."
  8. Use it: "In the prompt box, type `@` and select your installed plugin." OpenAI's quickstart does this in a "Work" chat ("switch the tab from **Chat** to **Work**").
- Web only: "Can I connect custom MCP servers on mobile? No - web only."

## Open or unverified

- ChatGPT personal plans. No primary page read states whether Free, Go, or Plus accounts can add a custom MCP server today. The help page names Business and Enterprise/Edu, and says Pro is limited to "read/fetch permissions". The developer quickstart speaks of "a personal plugin" without naming plans. Our card's buttons call write tools, so a Pro member may not be able to use them. This needs a hands-on check with real accounts before the member guide is written. Two help pages (`help.openai.com/en/articles/12584461` and `20001062`) refused the fetch tool and were read through a direct download instead.
- Whether Claude and ChatGPT send `capabilities.extensions["io.modelcontextprotocol/ui"]` in `initialize`. The spec requires it of hosts and the MCP matrix marks both as supporting MCP Apps, but neither vendor's docs show their actual handshake. Check by logging our own `initialize` requests.
- Which MCP protocol revision each host speaks to our server (2025-11-25 with `initialize`, or 2026-07-28 with per-request `_meta`). Not stated by either vendor. Our SDK 1.32.2 supports up to 2025-11-25. Whether a newer 1.x SDK reads `_meta["io.modelcontextprotocol/clientInfo"]` was not checked.
- Whether either host reuses one MCP connection or one `initialize` across conversations. No document says. With a stateless server the question only affects how often we see `initialize`.
- Whether Claude sends any conversation or user identifier in request `_meta`. None is documented.
- Whether Claude enforces `_meta.ui.visibility` (hides `["app"]` tools from the model, rejects card calls to model-only tools). The spec requires it; the Claude pages read do not mention `visibility`. ChatGPT's reference documents the key. Test an app-only tool in both.
- Whether a card-initiated `tools/call` to a write tool triggers a confirmation prompt in ChatGPT or in Claude. Not documented for card calls in either.
- Which `hostContext.styles.variables` ChatGPT supplies, and whether it honours `ui/notifications/size-changed`, `ui/open-link`, and `ui/request-display-mode`. OpenAI's pages name `ui/initialize`, `ui/notifications/tool-input`, `ui/notifications/tool-result`, `tools/call`, `ui/message`, `ui/update-model-context`, and `ui/notifications/host-context-changed`. They document sizing only through `window.openai.notifyIntrinsicHeight` and `window.openai.maxHeight`. The card should send `size-changed` and keep CSS fallbacks for every variable; if the card is clipped in ChatGPT, a feature-detected `window.openai?.notifyIntrinsicHeight` call is the documented alias.
- Claude's behaviour with a hand-written bridge. Claude's docs only show the SDK. The wire protocol is the same and the spec allows it, but it was not confirmed on a Claude page.
- The exact `ui/message` params shape. The stable spec shows `content` as one object; the SDK and Claude's page pass an array of blocks.
- The SDK's "auto-detects OpenAI env" note in `migrate_from_openai_apps.md` sits next to "`OpenAITransport` ... not yet available". What `App.connect()` does in ChatGPT was not confirmed. It does not affect a hand-written bridge.
- basic-host and authentication. Its README and `src/implementation.ts` show no bearer-token or OAuth handling. Our endpoint requires a token, so basic-host may need an unauthenticated local route or a small local change. Not tested.
- The MCP support matrix is "maintained by the community"; its marks for Claude and ChatGPT agree with the vendor docs, but the "Partial" for Inspector is not explained on the matrix page.
- Size of an inlined SDK bundle (`app-with-deps.js`) was not measured; it is not needed if the bridge is written by hand.
- Nothing was installed or run against a real host for this note. Every statement about host behaviour is from documentation.

## WhatsApp from Loop's number: Meta's rules as read on 2026-11-14 (task 7.1)

Read by a research agent through a page-summarising fetch tool, so wording is second-hand. Sources are Meta's own pages unless marked. Three points differ from design D7; section 7 is stopped until the founder decides.

### Where design D7 differs

1. **Reply buttons cannot carry a question's own options outside the 24-hour window.** Template quick-reply labels are fixed when the template is approved (up to 10, 25 characters); no send-time label is documented. Interactive reply buttons (up to 3, title 20 characters) do take per-message labels, but they are a service message and can be sent only inside the 24-hour window a member's own message opens. So a new ask sent to a member who has not written to Loop in the last day can carry a link or fixed-label buttons, not "Yes / No / Maybe" from the ask. Source: developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages; .../business-management-api/message-templates/components.
2. **A bare inbound message is not documented as opt-in.** It opens a 24-hour customer service window. Opt-in must clearly state that the person is opting in and must name the business. The pre-filled message and the page around it therefore have to say so in words and name Loop, not only the club. Whether Meta accepts an inbound WhatsApp message as the opt-in method is neither listed nor excluded. Source: whatsappbusiness.com/policy (updated 2026-09-23); developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in.
3. **Announcements risk being classed as marketing, and marketing templates are not delivered to US numbers.** A template whose body is mostly free text defaults to marketing; Meta re-categorises templates on its own, with a day's notice. "WhatsApp does not currently deliver marketing template messages to WhatsApp users with United States phone numbers." The new-ask and reminder templates plausibly pass as utility (the agent's inference, not Meta's statement). Source: .../updates-to-pricing/new-template-guidelines; .../templates/marketing-templates/per-user-limits.

### What matches

- Webhooks: `X-Hub-Signature-256`, `sha256=` plus HMAC-SHA256 of the payload keyed with the App Secret; GET handshake with `hub.mode`, `hub.verify_token`, `hub.challenge`.
- A button tap arrives with `context.id` holding the original message's id (`interactive.button_reply.id` for interactive buttons, `button.payload` for template quick replies), which is what `emba_reach_message.provider_id` is for.
- Opt-out must be honoured; no wording is mandated.
- Nothing requires posting into group chats.

### Costs and limits

- Priced per delivered message since 2025-07-01. Since 2026-10-01 utility messages are charged even inside an open window, and service messages are free only for the first 1,000 per number per month. Meta's marketing page still says otherwise; the developer page is taken as current. US rates were not obtained.
- A new, unverified business may message 250 unique users per moving 24 hours outside windows; verification or 2,000 quality deliveries raises it to 2,000. Two numbers until verified. A number already used in the WhatsApp app must be deleted from it first.
- Template review is automatic and can take up to 24 hours. URL buttons: at most two, one variable at the end of the URL.
- Not found: lead time to go live, verification requirements, block and report thresholds, any rule for or against one account messaging on behalf of many organizers.

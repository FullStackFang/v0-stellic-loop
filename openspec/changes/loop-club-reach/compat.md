# Compatibility: the in-chat card in each assistant

Task 3.4. Started 2026-11-14. The card is `lib/emba/team-card.ts`, served by the team connector at `ui://loop/card-v1.html`.

## What has been tested

Only one host so far: the test in `lib/__tests__/emba-card.test.ts`. It runs the real page in a DOM, stands in for the assistant on the bridge, and passes the card's tool calls to the real connector. It covers the handshake, theme and style values, the four tools' results, a tap on each control, a closed ask tapped from a stale card, an unreachable Loop, and member text with markup in it.

Nothing below has been tried in a real assistant. Each row says what the documents lead us to expect and what to look at when it is tried.

## To test by hand, in this order

| Host | How | Status |
| - | - | - |
| The extension's example host (`basic-host`) | Clone `modelcontextprotocol/ext-apps` outside this repo, run `examples/basic-host` against a local Loop. It sends no sign-in token, so it needs a tunnel to a deployment and a token, or a local change to the host. | Not run |
| MCP Inspector | `npx @modelcontextprotocol/inspector --cli <url> --transport http --method tools/list --app-info` should show `hasApp` and `resourceUri` on `waiting`, `events`, `ask` and `ask_results`. | Not run |
| Claude on the web and Claude Desktop | Add Loop as a custom connector, ask an unrelated question, then tap an option and "I'm in". | Not run: needs the founder's account |
| ChatGPT on the web | Add Loop as a custom MCP server under Plugins. | Not run: needs an account on a plan that allows it |
| A host with no cards (Claude Code) | Call `waiting`; the text must be complete. | Covered by `emba-waiting-mcp.test.ts`, which reads the text form only |

## Differences expected from the documents, and what the card does

| Topic | Claude | ChatGPT | What the card does |
| - | - | - | - |
| Bridge | Documents show the SDK only | Documents show a hand-written bridge | Hand-written bridge with the standard messages. To confirm in Claude. |
| Size | Height fits the content when the card reports it | Sizing is documented only through `window.openai.notifyIntrinsicHeight` | Sends the standard `ui/notifications/size-changed`. The ChatGPT-only call is not used, because its documents do not say it is required. If the card is cut off in ChatGPT, add it behind a check that it exists. |
| Border | None on the web, one on mobile, unless told | A hint | The page asks for a border (`prefersBorder: true`) and has a transparent background. |
| Style values | Supplies the standard variables | Which variables it supplies is not documented | Every variable has a fallback that is a light and dark pair. |
| A tap that writes | The user approves tool calls; "Always allow" exists | Tools that write need confirmation by default | Not known whether a tap asks for confirmation in either. The card waits up to 250 seconds, then says it could not reach Loop. |
| Declaring the card | The extension's helper writes the nested key and an older flat key | Nested key documented | Only the nested key, `_meta.ui.resourceUri`. If Claude shows no card, add the flat key first. |
| Passing on tool calls | Yes | A Pro account may be limited to reads | If the assistant says it passes on no tool calls, the controls are switched off and the card says to tell the assistant. |
| The same result handed over twice | Not stated | May redraw | The card redraws from the result; a tap already saved looks unsaved until the next result. |
| Hiding a tool from the model or the card | Not documented | Documented | Not relied on: `answer` and `interested` are open to both. |
| Several cards in one conversation | Old cards stay live | Not stated | A tap on an old card goes through the server's checks; a closed ask saves nothing and the card says so. |
| Mobile | Renders in a web view; the inline height is capped | Custom servers are web only | At most 5 items are drawn; the rest are counted. |
| Personal plans | Any plan can add a connector by address | Documented for Business and Enterprise/Edu only | Open question 3 in design.md. |

## Differences found in testing

None yet. Add a row here for each one, with how the card handles it.

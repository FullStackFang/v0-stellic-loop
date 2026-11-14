# LLM Wiki integration review

Reviewed public main-branch sources on 2026-11-08. This is a source inspection, not a local execution or security audit; upstream main can change.

## Observed implementation

- The desktop has a separate MCP server that forwards requests to its local HTTP API. It requires the desktop to run and supports token authentication. This is an external assistant calling the application, not a chat UI transport. [MCP README](https://github.com/nashsu/llm_wiki/blob/main/mcp-server/README.md)
- The MCP project binding pins calls to a selected project so desktop project switching does not silently redirect work. [Project binding](https://github.com/nashsu/llm_wiki/blob/main/mcp-server/src/project-binding.ts)
- The Claude Code bridge launches a local CLI and streams events to the frontend. Its comments explicitly exclude runner resume state and describe reconstructing multi-turn context from supplied messages. Thus using a CLI does not automatically remove the need to supply conversation context. [Claude bridge](https://github.com/nashsu/llm_wiki/blob/main/src-tauri/src/commands/claude_cli.rs)
- The Codex bridge uses a subprocess with JSON output, read-only sandboxing and ephemeral execution. It receives a prompt from the application. These source choices do not establish a reusable native session for Period. [Codex bridge](https://github.com/nashsu/llm_wiki/blob/main/src-tauri/src/commands/codex_cli.rs)
- The backend also has its own agent runtime and disk-backed session store. Consequently, describing the whole repository as merely an external-chat connector would be inaccurate. [Session store](https://github.com/nashsu/llm_wiki/blob/main/src-tauri/src/agent/session.rs), [runtime](https://github.com/nashsu/llm_wiki/blob/main/src-tauri/src/agent/runtime.rs)

## Period decisions

Reuse the architectural pattern: native runner bridge for the visible chat pane; a thin MCP bridge over a narrow local application API for tools; workspace pinning. Implement original Period commands rather than copying Wiki's document tools or agent loop.

Period owns financial state, typed calculation results, artifacts, revision checks and undo. The runner owns authentication and any supported session persistence. Period keeps enough transient context for follow-up questions; a permanent conversation archive is not a first-release requirement. Restart either resumes a verified runner session or clearly opens a new conversation attached to current financial state.

Do not copy the CLI transports unchanged: the reviewed text-completion paths are not evidence of a working Period MCP/tool loop. Prove streaming, financial tool calls, constrained tool access, cancellation and restart behavior for each installed supported runner version. Exact runner flags/protocols remain an implementation verification gate. ChatGPT web embedding is not part of this design; the OpenAI-facing runner target is Codex.

The source review changes the earlier API-key-first proposal. Direct API adapters and durable chat archives are deferred. MCP access remains authenticated and workspace-scoped; it does not grant blanket mutation authority. See [design.md](design.md) for the concrete authorization and cancellation contracts.

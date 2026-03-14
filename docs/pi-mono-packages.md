# pi-mono — Top 3 Mandatory Packages

pi-mono is a monorepo containing 7 packages. Three of them form the mandatory foundation that every project built on top of pi depends on.

## Dependency chain

```
pi-coding-agent
    └── pi-agent-core
            └── pi-ai
                    └── Anthropic / OpenAI / Google / Azure / Copilot APIs
```

---

## 1. `@mariozechner/pi-ai` — The LLM Layer

**Role:** Raw transport. Talks to AI providers, nothing more.

**What it does:**
- Unified streaming API over all LLM providers (Anthropic, OpenAI, Google, Azure, GitHub Copilot)
- Model registry: maps a `"provider/modelId"` string (e.g. `"anthropic/claude-sonnet-4-6"`) to the correct API format
- `streamSimple(model, messages, tools, onEvent)` — single entry point for any provider
- TypeBox types: `Message`, `Tool`, `StreamEvent`

**What it does NOT do:** No tool calling loop, no session state, no history management. It is a single-turn streaming call.

---

## 2. `@mariozechner/pi-agent-core` — The Agent Loop

**Role:** Wraps `pi-ai` into a stateful, multi-turn, tool-calling agent.

**What it does:**
- `Agent` class — holds conversation history, registered tools, configuration
- `agentLoop(agent, userMessage)` — runs the full turn cycle: prompt → response → tool calls → tool results → next turn, until no more tool calls
- `convertToLlm(messages)` — normalizes internal state to LLM wire format before each call
- `transformContext(messages, maxTokens)` — context window management (pruning/summarization)
- Emits structured events: `turn_start`, `turn_end`, `tool_call`, `tool_result`, `agent_end`

**Key type:** `AgentMessage` — the internal message format shared across the agent and extensions.

**What it does NOT do:** No built-in tools (no file read, no bash). No UI. No extension system. It is a pure agent loop.

---

## 3. `@mariozechner/pi-coding-agent` — The Coding CLI

**Role:** Builds the `pi` binary on top of `pi-agent-core`, adds coding tools and the extension system.

**What it does:**
- Built-in coding tools: `ReadFile`, `Bash`, `Edit`, `Write`, `Glob`, `Grep`
- `ExtensionAPI` — the interface all extensions receive:
  - `pi.registerCommand(name, { handler })` — add a `/command`
  - `pi.on(event, handler)` — hook into lifecycle events (`session_start`, `before_agent_start`, `agent_end`)
  - `ctx.ui.notify`, `ctx.ui.setStatus`, `ctx.ui.setFooter`, `ctx.ui.select`, `ctx.ui.confirm`
  - `ctx.cwd` — the current working directory
- Session management: `--no-session`, `--mode json`, `--append-system-prompt <file>`
- Extension loader: discovers and loads `.ts` extension files from `~/.pi/extensions/`

**What it does NOT do:** It does not define AI providers or the agent loop — it delegates entirely to `pi-agent-core` and `pi-ai`.

**Public tool factories:** `pi-coding-agent` also exports `createReadOnlyTools(cwd)` and `createTools(cwd)` for external consumers that want coding tools without the full CLI. pi-reviewer's CI uses `createReadOnlyTools` to give the review agent file-reading capability (`ReadFile`, `Glob`, `Grep`) without pulling in the extension system or terminal UI.

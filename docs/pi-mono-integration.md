# pi-reviewer — Integration with pi-mono

pi-reviewer uses pi-mono in two distinct contexts: **as a GitHub Action** (CI) and **as a pi extension** (local). Each context uses the pi-mono stack differently.

---

## GitHub Action (CI mode)

The Action is a standalone Node.js script (`src/review.ts`). It uses parts of all three pi-mono layers, but not the full CLI stack.

### What it uses

- **`@mariozechner/pi-agent-core`** — `Agent` class, runs the agent loop
- **`@mariozechner/pi-ai`** — `getModel()` to resolve `"provider/modelId"` strings
- **`@mariozechner/pi-coding-agent`** — `createReadOnlyTools(cwd)` only

```
action.yml
  └── src/review.ts
        ├── Agent (pi-agent-core)         ← agent loop
        ├── getModel (pi-ai)              ← model/provider resolution
        ├── createReadOnlyTools           ← ReadFile, Glob, Grep
        │   (pi-coding-agent)
        └── streamSimple (pi-ai) → Anthropic / Copilot API
```

### Why `createReadOnlyTools`

`pi-coding-agent` exports `createReadOnlyTools(cwd)` as a public API specifically for this use case. It returns `ReadFile`, `Glob`, and `Grep` tools — letting the review agent look up files for context — without including destructive tools (`Bash`, `Edit`, `Write`).

The CI uses the read tools but skips the full `pi-coding-agent` stack: no extension system, no session management, no terminal UI.

### What it does NOT use from `pi-coding-agent`

| Feature | Used |
|---|---|
| `createReadOnlyTools` | Yes |
| Extension system / `ExtensionAPI` | No |
| Session management | No |
| Terminal UI | No |
| `Bash` / `Edit` / `Write` tools | No |

### Flow

1. Checkout → fetch PR diff via `gh` CLI
2. `loadContext()` reads `AGENTS.md` / `CLAUDE.md`
3. `buildJSONSystemPrompt(context)` + `buildUserPrompt(diff)`
4. `new Agent({ tools: createReadOnlyTools(cwd) })` — read-only file access
5. `agent.prompt(userPrompt)` → agent loop runs, may read files for context
6. Post final assistant text as GitHub PR comment via GitHub API

---

## pi Extension (local mode)

The extension is loaded by `pi-coding-agent`'s extension system. It does **not** call the AI APIs directly — instead it spawns a `pi` subprocess and streams its JSON output.

### What it uses

**`@mariozechner/pi-coding-agent`** — `ExtensionAPI` only.

```
pi TUI
  └── ExtensionAPI (pi-coding-agent)
        └── extensions/pi-reviewer/index.ts
              ├── registerCommand("review", handler)
              ├── ctx.ui.setFooter()       ← custom spinner footer
              ├── ctx.ui.notify()          ← warnings, errors
              └── spawn("pi --mode json") ← subprocess
                    └── pi-agent-core (inside subprocess)
                          └── pi-ai (inside subprocess)
```

### Why spawn a subprocess instead of calling Agent directly

The extension does not import `pi-agent-core`. It delegates the agent run entirely to the `pi` subprocess via `--mode json`. This means:
- The subprocess inherits the user's current session config (model, API key, provider)
- SSH extensions loaded in the subprocess redirect Bash tool calls over SSH automatically
- The extension stays thin — it only parses JSON events from stdout

### How the extension uses ExtensionAPI

| ExtensionAPI surface | Usage |
|---|---|
| `pi.registerCommand("review", ...)` | Register the `/review` command |
| `ctx.cwd` | Pass working directory to `resolveDiff()` and the subprocess (local mode) |
| `ctx.ui.notify(msg, level)` | Show warnings (diff truncated, etc.) and errors |
| `ctx.ui.setFooter(render)` | Replace default footer with spinner + review source |
| `pi.on("before_agent_start", cb)` | Inject system prompt into the SSH agent before it starts |
| `pi.on("agent_end", cb)` | Capture final agent messages to extract review result; also used to sequence injection after save |
| `pi.on("tool_result", cb)` | Capture bash tool output — used in SSH+UI to silently extract the diff from the agent's git diff call |
| `pi.sendUserMessage(msg)` | Send the user prompt to the SSH agent; also used post-UI to trigger save/send turns |

### Events from subprocess (`--mode json`)

In **local mode**, the subprocess emits one JSON object per line on stdout. pi-reviewer processes `turn_end` events:

```
{ "type": "turn_end", "message": { "role": "assistant", "content": "..." } }
```

`createEventAccumulator` collects the last non-empty assistant text across all `turn_end` events. On process close, `getLastReviewText()` returns the final review. Intermediate tool-use turns (empty content) are ignored.

In **SSH mode**, the extension uses `pi.on()` hooks instead:
- `before_agent_start` — called before the agent's first turn; returns `{ systemPrompt }` to inject
- `agent_end` — called when the agent finishes; receives `event.messages` to extract the final assistant text

### `--ssh` flag

When `--ssh` is passed, the extension skips `resolveDiff()` and `loadContext()`. Instead, it builds a diff command string (`buildSSHDiffCommand`) and passes it to `buildSSHUserPrompt`, which instructs the agent to:
1. Run the diff command itself (via its bash tool, which is SSH-redirected by `ssh.ts`)
2. Read `AGENTS.md` / `CLAUDE.md` from the remote project root
3. Review and produce output

The agent fetches the diff on the remote — no local SSH implementation needed.

### `--ssh --ui` flag combination

Same agent setup as SSH-only, but uses `buildJSONSystemPrompt` (JSON format) and `runSSHReviewAndWait` instead of fire-and-forget. The diff is captured silently via a `tool_result` listener that watches for bash output containing `diff --git` — this avoids asking the agent to echo the diff back in its JSON response (which would flood the terminal).

After the agent finishes, the `ReviewResult` and captured diff are served via a local UI server. Post-UI actions (save/send) are sequenced carefully: `saveRemote` triggers the first agent turn, and if an injection message is also needed, it is sent via an `agent_end` listener after the save turn completes.

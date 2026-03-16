# Architecture

## Layers

```mermaid
flowchart TD
    subgraph pi["pi-coding-agent (ExtensionAPI)"]
        cmd["/review command"]
    end

    subgraph ext["Extension Layer (extensions/pi-reviewer/)"]
        args["args.ts\nparseArgs()"]
        footer["footer.ts\nsetReviewFooter()"]
        index["index.ts\ncommand handler"]
        runlocal["run-local.ts\nrunLocalReview()"]
        runssh["run-ssh.ts\nrunSSHReview()\nrunSSHReviewAndWait()"]
        uihandler["ui-handler.ts\nhandleUIReview()"]
        events["events.ts\ncreateEventAccumulator()"]
    end

    subgraph src["Source Layer (src/)"]
        resolver["diff-resolver.ts\nresolveDiff()"]
        filter["diff-filter.ts\nfilterDiff()"]
        context["context.ts\nloadContext()"]
        prompt["prompt-builder.ts\nbuildJSONSystemPrompt()\nbuildMarkdownSystemPrompt()\nbuildUserPrompt()\nbuildSSHUserPrompt()"]
        output["output.ts\nparseAgentResponse()"]
        uiserver["ui/\nstartUIServer()"]
    end

    subgraph subprocess["Subprocess (pi --mode json)"]
        agent["pi-agent-core\nAgent"]
        ssh["ssh.ts extension\n(if active)"]
        claude["Claude API"]
    end

    tui["@mariozechner/pi-tui"]
    git["git / gh CLI"]
    fs["AGENTS.md / CLAUDE.md"]
    browser["Browser UI"]

    cmd --> index
    index --> args
    index --> footer --> tui
    index --> runlocal --> events
    index --> runssh
    index --> uihandler --> uiserver --> browser
    index --> resolver --> filter --> git
    index --> context --> fs
    index --> prompt
    index --> output
    runlocal -->|"spawn pi --mode json"| subprocess
    runssh -->|"pi.on / pi.sendUserMessage"| subprocess
    agent --> ssh
    agent --> claude
    subprocess -->|"JSON events"| events
```

## Runtime flow

### Local mode (`/review`)

```mermaid
sequenceDiagram
    actor User
    participant pi as pi TUI
    participant ext as index.ts
    participant src as src/ layer
    participant sub as pi subprocess
    participant claude as Claude API

    User->>pi: /review [--branch dev] [--ui]
    pi->>ext: handler(args, ctx)
    ext->>ext: parseArgs()
    ext->>src: resolveDiff() → git diff
    src->>src: filterDiff() — noise + cap
    ext->>src: loadContext() → AGENTS.md / CLAUDE.md
    ext->>src: buildJSONSystemPrompt(context)
    ext->>src: buildUserPrompt(diff)
    ext->>sub: spawn pi --mode json --append-system-prompt
    loop each turn
        sub->>claude: prompt
        claude-->>sub: response
        sub-->>ext: turn_end JSON event
    end
    sub-->>ext: process close

    alt --ui flag
        ext->>ext: parseAgentResponse() → ReviewResult
        ext->>src: startUIServer(result, diff)
        src-->>User: browser UI
        User->>src: decide comments → Save / Send / Save & Send
        src-->>ext: injection message (if send)
        ext->>pi: writeFile pi-review.md (save)
        ext->>pi: sendUserMessage findings (send)
    else plain
        ext->>pi: writeFile pi-review.md
        pi->>User: notify "Review saved → pi-review.md"
    end
```

### SSH mode (`/review --ssh`)

```mermaid
sequenceDiagram
    actor User
    participant pi as pi TUI
    participant ext as index.ts
    participant runssh as run-ssh.ts
    participant agent as SSH agent (main pi process)
    participant remote as Remote machine (via SSH tools)
    participant claude as Claude API

    User->>pi: /review --ssh [--ui]
    pi->>ext: handler(args, ctx)
    ext->>ext: parseArgs()
    ext->>ext: buildSSHDiffCommand() → diff command string
    ext->>ext: buildSSHUserPrompt(diffCommand)

    alt --ui flag
        ext->>ext: buildJSONSystemPrompt() — JSON format
        ext->>runssh: runSSHReviewAndWait()
        runssh->>agent: pi.on("before_agent_start") → inject systemPrompt
        runssh->>agent: pi.on("tool_result") → capture bash output containing diff
        runssh->>agent: pi.sendUserMessage(userPrompt)
        agent->>remote: bash: git diff / gh pr diff
        remote-->>agent: raw diff
        note over runssh: tool_result fires → capturedDiff stored
        agent->>remote: read AGENTS.md / CLAUDE.md
        agent->>claude: review prompt
        claude-->>agent: JSON ReviewResult (no diff field)
        agent-->>runssh: agent_end → parseAgentResponse() + inject capturedDiff
        runssh-->>ext: ReviewResult (with diff)
        ext->>ext: filterDiff(result.diff)
        ext->>ext: startUIServer(result, diff)
        User->>ext: decide → Save / Send / Save & Send
        alt save (or save & send)
            ext->>agent: sendUserMessage → write pi-review.md on remote
            note over ext: agent_end listener registered for injection
        end
        alt send (or save & send)
            ext->>agent: sendUserMessage findings
        end
    else SSH-only
        ext->>ext: buildMarkdownSystemPrompt() — markdown + save instruction
        ext->>runssh: runSSHReview()
        runssh->>agent: pi.on("before_agent_start") → inject systemPrompt
        runssh->>agent: pi.sendUserMessage(userPrompt)
        agent->>remote: bash: git diff / gh pr diff
        agent->>remote: read AGENTS.md / CLAUDE.md
        agent->>claude: review prompt
        claude-->>agent: markdown review → write pi-review.md
        agent-->>runssh: agent_end
        runssh-->>User: notify "Review saved → pi-review.md"
    end
```

## Key design decisions

### Why the agent fetches its own diff in SSH mode

In SSH mode, the agent's bash/read/write/edit tools are transparently redirected over SSH by the `ssh.ts` extension. When we ask the agent to run `git diff ...`, it runs on the remote automatically. This means we don't need to implement SSH ourselves — we just tell the agent which command to run.

Previously the diff was fetched locally via `pi.exec`, but `pi.exec` is a plain local `spawn()` — it is **not** SSH-redirected. Only the agent's tools are. So having the agent fetch its own diff is both simpler and correct.

### Why the diff is captured from `tool_result` in SSH+UI mode

In SSH+UI mode, the UI needs the full diff for rendering. Asking the agent to echo the diff back inside its JSON response would:
1. Print the entire diff to the terminal as part of the agent's response text
2. Increase token count and slow down streaming

Instead, `run-ssh.ts` listens to the `tool_result` event and captures any bash output that contains `diff --git` — the standard git diff format. This gives us the full diff silently, without it appearing in the agent's response.

### Why `handleUIReview` returns the injection message instead of sending it

`handleUIReview` is called while the command handler is still suspended at `await handleUIReview(...)`. Calling `pi.sendUserMessage` from inside a suspended command causes an "Agent is already processing" error when:
- SSH+UI save-and-send: `saveRemote` already started the agent; the injection can't start a second concurrent turn.

The fix: `handleUIReview` returns the injection message. The caller sends it at the right time:
- **Local / SSH send-only**: agent is idle → `pi.sendUserMessage(injectionMsg)` called before the command returns.
- **SSH save-and-send**: `saveRemote` started the agent → a one-time `agent_end` listener sends the injection after the save turn completes (by which point the command has already returned).

### System prompt structure

`prompt-builder.ts` has a private `buildSharedBase(minSeverity)` that holds the role, severity tiers, rules, and severity filter — the ~90% shared between both public functions:

- **`buildJSONSystemPrompt(context, minSeverity)`** — adds the conventions-don't-repeat rule, JSON schema, and injects conventions/review-rules from context. Used by local mode and SSH+UI.
- **`buildMarkdownSystemPrompt(minSeverity)`** — adds the markdown format instructions and the save-to-pi-review.md instruction. Used by SSH-only.

User prompts:
- **`buildUserPrompt(diff, skippedFiles)`** — diff only; conventions already in system prompt (local mode).
- **`buildSSHUserPrompt(diffCommand)`** — instructs the agent to run the given diff command, then read `AGENTS.md`/`CLAUDE.md`, then review. Used by both SSH modes since the agent fetches everything at runtime.

### SSH-only vs SSH+UI divergence

Both modes share identical setup (`buildSSHDiffCommand` + `buildSSHUserPrompt`). They diverge only on:
- **System prompt format**: `buildMarkdownSystemPrompt` (markdown + save instruction) vs `buildJSONSystemPrompt` (JSON schema)
- **Agent execution**: `runSSHReview` (fire-and-forget) vs `runSSHReviewAndWait` (awaits JSON result + captures diff from `tool_result`)
- **Post-review**: SSH-only agent saves the file itself; SSH+UI returns the result to the local process for UI rendering

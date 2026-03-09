# pi-reviewer TODO

## Architecture

pi-reviewer has two independent parts that share no code:

### 1. GitHub Action (CI)

Runs on every PR via GitHub Actions. Uses `Agent` from `@mariozechner/pi-agent-core` directly.

```
pi-reviewer/
├── action.yml          ← GitHub Action entry point
├── src/
│   ├── diff-resolver.ts
│   ├── context.ts
│   ├── output.ts
│   └── review.ts       ← uses Agent directly (no createAgentSession)
└── tests/

project-x/
└── .github/workflows/
    └── pi-review.yml   ← triggers on PR, calls zeflq/pi-reviewer@v1
```

**Project X workflow:**
```yaml
name: Pi Reviewer
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zeflq/pi-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 2. Pi extension (local dev, inside pi TUI)

Registers a `/review` command inside the pi TUI.
Spawns `pi --mode json -p --no-session` as a subprocess — same pattern as the official subagent example.
No shared code with the GitHub Action.

```
pi-reviewer/
└── extensions/
    └── pi-reviewer/
        └── index.ts    ← registers /review command, spawns pi subprocess
```

Install during dev:
```bash
pi install ~/projects/pi-reviewer
```

Install from GitHub:
```bash
pi install https://github.com/zeflq/pi-reviewer
```

---

## How the agent knows the project conventions

Both the GitHub Action and the pi extension read `AGENTS.md` from the project root.
If `AGENTS.md` does not exist, the agent reviews without project-specific context.

---

## Testing strategy

Every feature in `src/` is tested with vitest. Agent is always mocked — tests never call the LLM.

```
tests/
├── diff-resolver.test.ts
├── context.test.ts
├── review.test.ts
└── output.test.ts
```

---

## Implementation steps

### ✅ Done

- [x] `src/diff-resolver.ts` + tests
- [x] `src/context.ts` + tests
- [x] `src/output.ts` + tests
- [x] `src/review.ts` + tests
- [x] `action.yml`
- [x] `src/init.ts` + tests

### ✅ 1. Cleanup

- [x] Remove `src/hello.ts`
- [x] Remove `src/cli.ts` and `src/cli.js`
- [x] Remove `"bin"` field from `package.json`
- [x] Refactor `src/review.ts` to use `Agent` from `@mariozechner/pi-agent-core` directly
- [x] Update `tests/review.test.ts` to mock `Agent` instead of `createAgentSession`

### ✅ 2. Extract shared layer from `src/review.ts`

- [x] `src/prompt-builder.ts` — `buildSystemPrompt` + `buildUserPrompt`, outputs structured JSON shape
- [x] `src/diff-resolver.ts` — shared ✅
- [x] `src/context.ts` — shared ✅

### ✅ 3. Upgrade `src/output.ts` to line-specific PR comments

- [x] `ReviewComment` type: `{ file, line, side: "LEFT"|"RIGHT", body }`
- [x] `ReviewResult` type: `{ summary, comments }`
- [x] `parseAgentResponse(text)` — parses JSON, falls back to `{ summary: text, comments: [] }`
- [x] `comment` target uses PR Reviews API (`POST /repos/{repo}/pulls/{pr}/reviews`)
- [x] `terminal` and `file` targets render readable text
- [x] Tests updated — 12 tests covering Reviews API, line comments, and plain-text fallback

### ✅ 4. `extensions/pi-reviewer/index.ts` — pi extension

- [x] Registers `/review` command via `pi.registerCommand`
- [x] Parses `--diff`, `--branch`, `--pr`, `--dry-run`
- [x] Calls `resolveDiff` + `loadContext` + `buildSystemPrompt` + `buildUserPrompt`
- [x] Spawns `pi --mode json -p --no-session --append-system-prompt <tmpfile> <userPrompt>`
- [x] Streams JSON events, parses `agent_end`, displays via `ctx.ui.notify()`
- [x] `"pi": { "extensions": ["./extensions"] }` added to `package.json`
- [x] Cleans up temp file on exit, clear `ENOENT` error if `pi` not in PATH

### 5. Release

- [x] Add `build` script: `tsc`
- [x] Update `action.yml` run step: `node ${{ github.action_path }}/dist/src/review.js`
- [x] `dist/` compiled and tracked in git (commit before tagging)
- [ ] Publish to GitHub Marketplace as `zeflq/pi-reviewer`

### 6. Multi-provider API key support

- [ ] Accept pi mono API key in CI (not just `anthropic-api-key` / `copilot-api-key`)
- [ ] Add `pi-api-key` input to `action.yml`
- [ ] Route to correct provider based on `model` input prefix or key type
- [ ] Update README inputs table

### ✅ 7. Project conventions file support

- [x] Read `CLAUDE.md` in addition to `AGENTS.md` when loading project context
- [x] Priority order: `AGENTS.md` → `CLAUDE.md` (first found wins)
- [x] Resolve markdown links to other `.md` files in `loadContext` — inline referenced file content so the agent sees the full context (e.g. `[conventions](./docs/api-conventions.md)`)
- [x] Update docs + tests

### ✅ 8. Diff size handling

- [x] Filter known noise files before diff reaches the agent (lockfiles, `dist/`, `build/`, generated files)
- [x] Add hard cap with warning when diff exceeds limit (100k chars) — affects CLI, CI, and agent mode
- [x] Surface truncation warning to user (`⚠ Diff truncated — N files excluded`)
- [x] Add tests for filter rules and truncation behavior
- [x] Fix truncation to drop whole file sections instead of slicing the string mid-diff (section-boundary truncation)
- [x] Append skipped file names to the user prompt so the agent acknowledges them in its summary

### ✅ 9. SSH support (`--ssh`)

- [x] Add `--ssh` flag to `/review` command
- [x] When set, skip `resolveDiff()` and `loadContext()` in the extension handler
- [x] Build user prompt as an instruction for the spawned pi subprocess to fetch the diff via its `Bash` tool (SSH-redirected by ssh.ts)
- [x] `AGENTS.md` / `CLAUDE.md` read via subprocess `Read` tool (also SSH-redirected)
- [x] System prompt unchanged — agent still returns same JSON review format
- [x] No runtime check for ssh.ts — document that `--ssh` requires an SSH extension (e.g. ssh.ts) to be installed; without it, falls back silently to local execution
- [x] Update README with `--ssh` usage example and prerequisite note

### 11. Severity filtering (`--min-severity`)

- [ ] Add `--min-severity info|warn|critical` flag to `/review` command (default: `info`)
- [ ] Add `min-severity` input to `action.yml` (default: `info`)
- [ ] Pass threshold to `buildSystemPrompt` so the agent is instructed to skip below-threshold issues (saves tokens)
- [ ] Filter `comments` in `parseAgentResponse` output as a safety net — drop comments below threshold before posting
- [ ] Update README + tests

### 10. Custom system prompt

- [ ] Add `system-prompt` input to `action.yml` (file path relative to project root)
- [ ] If file exists, use its content as-is instead of `buildSystemPrompt`
- [ ] `AGENTS.md` / `CLAUDE.md` context is still appended unless the custom prompt already includes it
- [ ] Update README inputs table + add usage example

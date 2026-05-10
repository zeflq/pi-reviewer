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
          pi-api-key: ${{ secrets.PI_API_KEY }}
```

### 2. Pi extension (local dev, inside pi TUI)

Registers a `/review` command inside the pi TUI.
**Local mode** spawns `pi --mode json -p --no-session` as a subprocess — accepts `--model` and `--thinking` to control the review agent independently of the parent session.
**SSH mode** does not spawn a subprocess — it runs directly inside the current pi agent session, which already has SSH bash tool access to the remote machine. Because of this, `--model` and `--thinking` have no effect in SSH mode; the model and thinking level are fixed to whatever the parent session uses.
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

### ✅ 6. Multi-provider API key support

- [x] Accept pi mono API key in CI (not just `anthropic-api-key` / `copilot-api-key`)
- [x] Add `pi-api-key` input to `action.yml`
- [x] Route to correct provider based on `model` input prefix or key type
- [x] Update README inputs table

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

### ✅ 19. Untracked file support

- [x] Run `git add -N` on untracked files before diffing to register them as intent-to-add, making them visible to `git diff` without staging their content; restore index state after diff is captured with `git rm --cached`
- [x] Applied to both `--branch` / default merge-base path and `--diff` path; `--pr` uses remote diff as-is

### ✅ 20. Monorepo / sub-project scoping (`--dir`)

- [x] Add `--dir <path>` flag to `/review` command — run the review in a specific directory (e.g. a sub-project in a monorepo); path must be a git repository
- [x] Resolves path against the current cwd, switches all git commands to that directory
- [x] Works with all diff modes (`--branch`, `--pr`, `--diff`); SSH uses the remote cwd so `--dir` is local-only

### ✅ 9. SSH support (`--ssh`)

- [x] Add `--ssh` flag to `/review` command
- [x] When set, skip `resolveDiff()` and `loadContext()` in the extension handler
- [x] Agent fetches diff itself via SSH-redirected bash tool (`buildSSHDiffCommand` + `buildSSHUserPrompt`)
- [x] `AGENTS.md` / `CLAUDE.md` read via agent's SSH-redirected `Read` tool
- [x] SSH-only: `buildMarkdownSystemPrompt` — agent writes review to `pi-review.md` directly
- [x] SSH+UI: `buildJSONSystemPrompt` — agent returns structured JSON; diff captured silently from `tool_result` event (no terminal flood)
- [x] Post-UI save/send sequenced via `agent_end` listener to avoid "agent already processing" error
- [x] No runtime check for ssh.ts — document that `--ssh` requires an SSH extension (e.g. ssh.ts) to be installed; without it, falls back silently to local execution
- [x] Update README with `--ssh` usage example and prerequisite note

### ✅ 11. Severity filtering (`--min-severity`)

- [x] Add `--min-severity info|warn|critical` flag to `/review` command (default: `info`)
- [x] Add `min-severity` input to `action.yml` (default: `info`)
- [x] Pass threshold to `buildSystemPrompt` so the agent is instructed to skip below-threshold issues (saves tokens)
- [x] Filter `comments` in `parseAgentResponse` output as a safety net — drop comments below threshold before posting
- [x] Update tests

### ✅ 14. Severity system improvements

- [x] Add emoji markers to severity levels: 🔴 CRITICAL, 🟡 WARN, 🔵 INFO
- [x] Render emoji markers in terminal, file, and GitHub comment output
- [x] Embed emoji in agent system prompt so they appear in all output paths (Reviews API + Issues API)

### ✅ 13. REVIEW.md support

- [x] `loadContext` reads `REVIEW.md` from project root in addition to `AGENTS.md` / `CLAUDE.md`
- [x] Merge strategy: `AGENTS.md` / `CLAUDE.md` (project conventions) + `REVIEW.md` (review-specific rules) — additive, not a fallback
- [x] Label sections clearly in the system prompt so the agent distinguishes general conventions from review-only rules
- [x] Markdown link inlining supported in `REVIEW.md`
- [x] Update README with `REVIEW.md` usage example (what to flag, what to skip)
- [x] Update tests

### 12. GitLab CI/CD support

- [ ] Add `gitlab` target to `src/output.ts` — post review via GitLab MR Notes API (`POST /projects/:id/merge_requests/:iid/notes`)
- [ ] Add `src/init-gitlab.ts` — generate `.gitlab-ci.yml` with a merge request pipeline that runs pi-reviewer
- [ ] Auth via `CI_JOB_TOKEN` or personal access token (`GITLAB_TOKEN`)
- [ ] Update `init` command to detect platform (GitHub vs GitLab) or accept a `--platform` flag
- [ ] Update README with GitLab setup instructions
- [ ] Add tests for GitLab comment output target

### 15. Native diff review window (`--ui`, local server + Monaco)

- [x] Add `--ui` flag to `/review` command
- [x] After review completes, spin up a local HTTP server on a random port
- [x] Serve a Monaco diff UI — render the diff with structured inline comments overlaid (same experience as GitHub review)
- [x] Open browser automatically (`open` / `xdg-open` / `start`)
- [x] Works on macOS, Linux, Windows — zero extra deps (Node built-in `http`)
- [x] **Comment decisions — user must act on every comment before any action is available:**
  - ✅ **Accept** — injected into agent context
  - ❌ **Reject** — not injected, excluded entirely
  - 💬 **Discuss** — reveals free-form text input, text is injected
- [x] **Three actions (all disabled until every comment has a decision):**
  - **Send** — inject accepted + discussed comments → start new agent turn → close
  - **Save** — write result + decisions to `pi-review.md` → close (no agent turn)
  - **Save & Send** — write to `pi-review.md` + start new agent turn → close
- [x] **On Send / Save & Send:** inject full context — AGENTS.md / CLAUDE.md + REVIEW.md + accepted/discussed comments (bot finding + user discuss text)
- [x] **On close with no action:** nothing injected, nothing saved, server shuts down silently
- [x] Server shuts down after any action or on window close
- [x] SSH mode supported — diff captured from `tool_result` event, `ReviewResult` received from remote agent; save/send sequenced via `agent_end` listener
- [ ] **Renderer strategy:** use Glimpse (cross-platform native webview) as default; fall back to `open`/`xdg-open`/`start` launching the system browser if Glimpse is unavailable

### ✅ 16. Local mode progress feedback

- [x] Show `Fetching diff…` and `Loading context…` before the subprocess starts
- [x] Surface `thinking_start` → `Thinking…` notification when model begins reasoning
- [x] Stream thinking sentences via `thinking_delta` from `message_update` events
- [x] Show `Writing review…` when model starts writing the JSON output (`text_start`)
- [x] Note: local mode makes no tool calls (diff + context are pre-loaded in prompt) — no tool-call log available unlike SSH mode where the agent fetches them itself
- [x] Footer shows active model short name and thinking level during review (e.g. `gpt-5.4-mini · low`); omitted when neither is set
- [x] Actionable error messages for API errors (`stopReason: error`) and thinking-only responses (model returned reasoning but no text output)

### ✅ 17. User config (`~/.pi/pi-reviewer/config.json`)

- [x] `theme` — persisted via `POST /config`; default `"dark"`
- [x] `viewMode` — persisted via `POST /config`; default `"split"`
- [x] `verbose` — read from config; set via `--verbose` flag or manually in config file
- [x] `minSeverity` — read from config; set via `--min-severity` flag or manually in config file
- [x] `model` — persisted via `POST /config` from the UI settings panel; default `undefined` (uses parent session model)
- [x] `thinking` — persisted via `POST /config` from the UI settings panel; default `undefined` (no thinking override)
- [x] `autoCollapseViewed` — persisted via `POST /config`; default `false`
- [x] All persistence goes through a single `POST /config` route with `applyConfigPatch()` per-key validation
- [x] `applyConfigPatch` uses a `VALID` lookup table for enum fields — no per-field if-chains
- [x] CLI reads config but never writes it
- [x] Refactored `src/core/ui/server.ts` → `server/{types,config,routes,index}.ts`; config logic moved to `src/core/config.ts` (shared, not UI-specific)
- [x] Route table replaces if/else chain; individual config routes consolidated into one
- [x] `SettingsContext` eliminates prop drilling — components read/write settings via `useSettings()`
- [x] `defaultBranch` — config-only (no UI); falls back to `git symbolic-ref refs/remotes/origin/HEAD` when unset

### 18. UI improvements (GitHub-inspired)

- [x] **Syntax highlighting** — colorize the diff by language instead of plain text
- [x] **Split diff view** — side-by-side (LEFT / RIGHT) option alongside the current unified view
- [x] **Submit review panel** — replace Save / Send / Save & Send buttons with a single "Finish review" button; click opens a panel with a global comment textarea and 3 radio options (Send / Save / Save & Send); submit triggers the selected action with the comment injected
- [x] **Summary overview panel** — replace the inline summary dropdown with an ⓘ icon button; click opens a side panel (GitHub-style Overview) rendering the summary markdown; add a separator between the left icon cluster and the right action cluster in hdr2
- [x] **Layout settings panel** — replace the split/unified toggle icon with a ⚙ gear icon; click opens a dropdown panel (GitHub-style) with layout options: Unified / Split (radio); extracted as `LayoutPanel` component; gear button placed next to "Finish review"
- [x] **Model/thinking display** — read-only "reviewed by" chip next to the diff source showing the model short name and thinking level used for this review (e.g. `gpt-5.4-mini · low`)
- [x] **Settings panel** — unified settings panel (replaces LayoutPanel) with three sections: Layout (split/unified), Default model (scrollable list grouped by provider, checkmark on active default), Default thinking level; selections persisted to config via HTTP
- [x] **Viewed file checkbox** — "Viewed" toggle in each file header; disabled while comments are unresolved; auto-checked when the last comment in the file is decided; viewed files are visually dimmed; auto-collapse on viewed (off by default, toggle in settings panel); scroll-to-top button appears after 400 px, fixed bottom-right
- [ ] **Annotate** — unified annotation feature: click a line or the file header to attach a free-form note; line-level and file-level notes both injected into agent context on Send
- [ ] **Keyboard shortcuts** — `n`/`p` next/prev comment, `a`/`r`/`d` accept/reject/discuss, `f` finish review; show shortcut hints on hover
- [ ] **Comment severity filter** — in-UI toggle to show/hide INFO / WARN / CRITICAL comments without re-running the agent; lets user focus on what matters on large diffs
- [ ] **Re-run review** — button available before finishing; re-sends the same diff to the agent with optionally different settings (model, min-severity); replaces the current comments with the new result; useful when you edit `REVIEW.md` or want a stricter/looser severity pass before acting
- [x] **Markdown rendering in comment bodies** — render backticks, bold, lists, and code blocks in comment body text instead of plain text; makes complex review comments significantly easier to scan
- [ ] **Bulk decisions** — "Accept all INFO", "Reject all WARN", or "Reject all" buttons; reduces clicking on large diffs with many low-severity comments
- [ ] **Decision undo indicator** — visual "changed" badge when a decision has been altered after first being set, so the user can track what they reconsidered
- [x] **Comment count badge by severity** — show `3 🔴 · 5 🟡 · 2 🔵` breakdown in the header progress area for at-a-glance severity distribution
- [ ] **Expand context lines** — GitHub-style "…" button between diff hunks to load additional surrounding context lines without leaving the page
- [ ] **Word-level diff highlighting** — within a changed line, highlight the exact words/tokens that differ rather than the whole line background
- [x] **Empty state** — when the review has zero comments, show a clear "No issues found" message instead of a blank file list
- [x] **Collapse all / Expand all** — single button in the header to collapse or expand every file at once
- [x] **File tree folder compression** — collapse single-child directory chains into combined names (e.g. `providers/oauth/handlers`) à la VS Code; contained hover highlight with margin + border-radius; widen sidebar to 296 px; bump tree and comment body font size to 13 px
- [x] **Version in wordmark** — display `vX.Y.Z` next to the wordmark, injected at build time from `package.json` via Vite `define`

### 21. Pluggable context provider API ✅

See [`extensions/pi-reviewer-doc-context/README.md`](./extensions/pi-reviewer-doc-context/README.md) for the Context Provider API.

- [x] `ContextFile`, `ContextGroup`, `ContextProvider`, `ContextProviderEvent`, `CONTEXT_PROVIDER_EVENT`, `MinimalEventBus` exported from `src/core/context.ts`
- [x] `collectProviderContext(events, cwd, diffFiles, fs?): Promise<ContextGroup[]>` — sync emit, async provider calls, passes `fs` at call time, groups filtered if empty
- [x] `mergeContextFiles(result: ContextResult): ContextFile[]` — replaces repeated `[...conventions, ...reviewRules]` spreads
- [x] `extractDiffFiles(diff: string): string[]` added to `src/core/diff-resolver.ts`
- [x] `buildJSONSystemPrompt` and `buildMarkdownSystemPrompt` accept optional `contextFiles: ContextFile[]`
- [x] All 4 paths in `extensions/pi-reviewer/index.ts` wired: dry-run SSH, dry-run local, SSH, local
- [x] SSH path passes `sshFs(remote)` to `collectProviderContext`; local path uses default `localFs()`
- [x] Built-in and provider context paths merged into a single `Context: …` notify
- [x] Refactors: `buildSSHDiffCommand` → `args.ts`, `resolveCurrentModelId` → `model.ts`, `extractAssistantText` → `src/core/output.ts`
- [x] Tests: `extractDiffFiles`, `collectProviderContext`, `buildJSONSystemPrompt`/`buildMarkdownSystemPrompt` with context files, integration test in `tests/extensions/index.test.ts`

### 22. UI: Context tab ✅

- [x] Context right panel in the review UI — toggles exclusively with Overview (one panel at a time)
- [x] Built-in group: `AGENTS.md`, `REVIEW.md` (all files from `mergeContextFiles`) shown under "built-in"
- [x] Provider group: one section per registered `ContextProvider` (name from `register(name, provider)`)
- [x] Each file expandable — click path to reveal content injected into the system prompt
- [x] `SidePanelLayout` / `SidePanel` shared shell — FileTree, Summary, and Context all use the same 296 px sticky container
- [ ] ~~markdown-linked files~~ — superseded; context files are now typed `ContextFile[]` end-to-end, no separate `loadedFiles` field needed
- [ ] Mark provider files as "loaded" if the agent called Read on them during the review — deferred, requires tool-call interception

### 23. Built-in doc-context ContextProvider extension ✅

- [x] Standalone pi extension `extensions/pi-reviewer-doc-context/` — no code dependency on pi-reviewer, only coupled via the `"pi-reviewer:collect-context-providers"` event string
- [x] Scans configured doc dirs (default: `.pi/notes`, `.claude/notes`, `.agents/notes`) for `.md` files with a `description` frontmatter field; recurses one subdirectory level
- [x] Keyword extraction from diff file paths (strip extension, split on `/`, `-`, `_`, `.`, camelCase, lowercase, min 3 chars); matched against description + file path
- [x] SSH-transparent: provider receives `fs` (local or SSH) at call time via `ContextProvider` opts — no SSH-specific code in the extension
- [x] Config at `~/.pi/pi-reviewer-doc-context/config.json` (`docDirs` field); entirely owned by this extension, pi-reviewer has no knowledge of it
- [x] Local `Fs` interface (3 methods: `read`, `list`, `join`) — no import of `FsOps` from pi-reviewer src
- [x] Tests: `extractKeywords`, `parseDescription`, `isRelevant` in `tests/extensions/doc-context-provider.test.ts`
- [x] API documented in `extensions/pi-reviewer-doc-context/README.md`

### 24. User-configurable exclude patterns

- [ ] Add `excludePatterns` field to `~/.pi/pi-reviewer/config.json` — array of glob/regex strings merged with `NOISE_PATTERNS` before `filterDiff` runs
- [ ] Read and compile patterns in `readConfig`; pass to `filterDiff` alongside the built-in list
- [ ] Surface excluded-by-user files in the existing `⚠` warning line, distinct from built-in noise exclusions
- [ ] Update README configuration table with `excludePatterns` field

### 10. Custom system prompt

- [ ] Add `system-prompt` input to `action.yml` (file path relative to project root)
- [ ] If file exists, use its content as-is instead of `buildSystemPrompt`
- [ ] `AGENTS.md` / `CLAUDE.md` context is still appended unless the custom prompt already includes it
- [ ] Update README inputs table + add usage example

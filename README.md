# pi-reviewer

AI-powered PR reviewer using the pi agent — model-agnostic, works with any provider.

- Review diffs locally, over SSH on a remote machine, or automatically on every pull request in CI
- Findings structured by severity (critical / warn / info) and filtered against your project conventions
- Interactive browser UI — inspect each finding against the diff, decide per-comment, then save or send to the agent
- Model-agnostic — works with any provider (Anthropic, OpenAI, etc.)

![pi-reviewer demo](./docs/demo.gif)

---

## Extension

Runs inside the [pi](https://github.com/mariozechner/pi) TUI as a `/review` command. The agent reviews your diff and returns structured findings — you decide what to do with them.

### Local mode

The default. Fetches the diff and your project conventions locally, spawns a pi subprocess to run the review, then saves the result to `pi-review.md`.

```
/review
/review --branch dev
/review --pr 42
/review --diff HEAD~1
```

Progress is shown in the pi TUI as the review runs — diff fetch, context load, agent thinking, and writing the review are all surfaced as notifications.

### SSH mode (`--ssh`)

For reviewing code on a remote machine. Instead of fetching the diff locally, the agent fetches it on the remote via its SSH-redirected bash tool — no local git access needed. Requires an SSH extension (e.g. [ssh.ts](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/ssh.ts)) to be active.

```
/review --ssh
/review --ssh --pr 42
/review --ssh --branch dev
```

The agent reads `AGENTS.md` / `CLAUDE.md` and `REVIEW.md` from the remote project root, runs the review, and saves `pi-review.md` directly on the remote.

### UI mode (`--ui`)

Opens a local browser-based review interface after the agent finishes. You can inspect every finding against the diff, decide per-comment (accept / reject / discuss), and choose what to do:

- **Save** — write decisions to `pi-review.md`
- **Send** — inject accepted findings into the agent as a follow-up turn
- **Save & Send** — both

```
/review --ui
/review --ssh --ui
```

Cards change color after each decision (accepted → green tint, rejected → dimmed) so you can see at a glance what still needs attention. A "jump to next pending" button lets you move through unreviewed comments quickly.

The dark/light theme toggle is remembered across reviews via `~/.pi/pi-reviewer/config.json`.

`--ssh --ui` works the same as local `--ui` — the diff is captured silently from the agent's tool output and displayed in the browser without a second SSH round-trip.

### Fallback UI

If the diff is empty or the agent returns no inline comments, the UI still opens with the summary panel — you can read the review and choose Save, Send, or close.

---

## CI Agent

Runs on every pull request via GitHub Actions. The agent posts an inline review comment directly on the PR using the GitHub Reviews API.

### Setup

Run once in your project root:

```bash
npx github:zeflq/pi-reviewer init
```

This generates `.github/workflows/pi-review.yml`:

```yaml
name: Pi Reviewer

on:
  pull_request:
    types: [opened, synchronize, reopened]
  workflow_dispatch:
    inputs:
      min-severity:
        description: 'Minimum severity to report (info, warn, critical)'
        required: false
        default: 'info'
        type: choice
        options:
          - info
          - warn
          - critical

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: zeflq/pi-reviewer@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pi-api-key: ${{ secrets.PI_API_KEY }}
          min-severity: ${{ inputs.min-severity || 'info' }}
```

Commit it to your default branch, then add your API key to your repo secrets:
- `PI_API_KEY` — your [pi](https://github.com/mariozechner/pi) API key, works with any AI provider (Anthropic, OpenAI, etc.)

### CI usage

Every pull request triggers an automatic review comment posted by `github-actions[bot]`.

You can also trigger a review manually via **Actions → Pi Reviewer → Run workflow**, where you can select the minimum severity level to report (`info`, `warn`, or `critical`).

### Inputs

| Input | Required | Description |
|---|---|---|
| `github-token` | yes | GitHub token to post PR comments |
| `pi-api-key` | yes | [pi](https://github.com/mariozechner/pi) API key — works with any AI provider (Anthropic, OpenAI, etc.) |
| `model` | no | Model to use in `provider/modelId` format (e.g. `anthropic/claude-opus-4-6`) |
| `post-comment` | no | Post review as a GitHub PR comment (default: `true`) |
| `min-severity` | no | Minimum severity to report: `info`, `warn`, or `critical` (default: `info`) |

### Bot identity

By default, review comments appear under `github-actions[bot]` — the built-in GitHub Actions identity tied to `secrets.GITHUB_TOKEN`. No extra setup required.

To post comments under a custom bot name, you need a **GitHub App**:

1. Create a GitHub App at `github.com/settings/apps/new`
   - Set **Pull requests** permission to **Write**
   - Disable the webhook (not needed)
2. Install the app on your repository
3. Generate a **private key** and note the **App ID**
4. Add two secrets to your repo:
   - `BOT_APP_ID` — the App ID
   - `BOT_PRIVATE_KEY` — the private key contents

Then update your workflow to exchange the app credentials for a token before calling pi-reviewer:

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: tibdex/github-app-token@v2
    id: bot-token
    with:
      app_id: ${{ secrets.BOT_APP_ID }}
      private_key: ${{ secrets.BOT_PRIVATE_KEY }}

  - uses: zeflq/pi-reviewer@main
    with:
      github-token: ${{ steps.bot-token.outputs.token }}
      pi-api-key: ${{ secrets.PI_API_KEY }}
      min-severity: ${{ inputs.min-severity || 'info' }}
```

The review comment will then appear under your GitHub App's name (e.g. `my-bot[bot]`).

---

## Shared features

### Extension options

Install the extension once:

```bash
pi install https://github.com/zeflq/pi-reviewer
```

Then inside the pi TUI:

| Option | Description | Example |
|---|---|---|
| `--branch <name>` | Compare current branch against this branch (default: auto-detected from `origin/HEAD`) | `--branch dev` |
| `--pr <number>` | Fetch and review a specific PR diff via `gh` CLI | `--pr 42` |
| `--diff <ref>` | Review changes since a specific git ref | `--diff HEAD~1` |
| `--ssh` | SSH mode: agent fetches diff and conventions on the remote (requires SSH extension) | `--ssh` |
| `--ui` | Open browser review UI after the agent finishes | `--ui` |
| `--min-severity <level>` | Only report issues at this level and above: `info`, `warn`, or `critical` (default: `info`) | `--min-severity warn` |
| `--dry-run` | Print the diff and prompt without calling the agent | |

### Diff coverage

`/review` and `--branch` use `git merge-base` to diff from the point where your branch diverged — committed changes, staged files, and unstaged edits are all included. You don't need to commit before reviewing.

`--diff` and `--pr` use the exact ref or remote diff as-is (no working tree changes).

The status bar shows which branches are being compared:
```
Reviewing feature/my-branch vs origin/develop...
```

### Diff size handling

Before the diff reaches the agent, pi-reviewer automatically filters out noise files (lockfiles, `dist/`, `build/`, `.next/`, `node_modules/`, minified files, `.d.ts` files) to keep the review focused.

If the remaining diff still exceeds 100k characters, whole file sections are dropped — never sliced mid-hunk — and the agent is explicitly told which files were skipped so it can mention them in its summary as not reviewed.

A warning is surfaced in the console whenever files are excluded or skipped:
```
⚠ 1 noise file excluded (package-lock.json) — 2 files skipped — diff exceeded 100,000 chars (src/big.ts, src/huge.ts)
```

### Project conventions

Create `AGENTS.md` or `CLAUDE.md` at the root of your project to give the reviewer context about your conventions, patterns, and decisions. The agent reads it before every review — both in CI and locally via the pi extension.

- `AGENTS.md` is checked first; `CLAUDE.md` is used as a fallback if `AGENTS.md` is not found.
- Filenames are matched case-insensitively (`agents.md`, `Agents.md`, and `AGENTS.md` all work).
- `REVIEW.md` is always loaded alongside `AGENTS.md`/`CLAUDE.md` when present — use it for review-specific rules that don't belong in your general conventions.
- Markdown links to other `.md` files (e.g. `[api conventions](./docs/api.md)`) are automatically inlined so the agent sees the full context.

**`AGENTS.md`** — general project conventions:
```markdown
# Project Conventions

## Function Naming
- Prefix async data fetchers with `fetch` (e.g. `fetchUser`, `fetchOrders`)
- Prefix boolean functions with `is`, `has`, or `can`
- Prefix mutations with a verb: `update`, `delete`, `create`, `reset`

[API conventions](./docs/api-conventions.md)
```

**`REVIEW.md`** — review-only rules (what to flag, what to skip):
```markdown
# Review Guidelines

## Always flag
- New API endpoints without an integration test
- Database migrations that are not backward-compatible
- `fetch` calls missing `res.ok` check or `try/catch`

## Skip
- Formatting-only changes in generated files under `dist/`
- Lock file diffs
```

---

See [TODO.md](./TODO.md) for the full roadmap.

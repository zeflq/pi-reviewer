# pi-reviewer

AI-powered PR reviewer using Claude agent.

## Setup

Run once in your project root:

```bash
npx github:zeflq/pi-reviewer init
```

This generates `.github/workflows/pi-review.yml`. Commit it to your default branch.

Then add your API key to your repo secrets:
- `ANTHROPIC_API_KEY` — required

## CI usage

Every pull request triggers an automatic review comment posted by `github-actions[bot]`.

## Local review (pi extension)

Install the extension once:

```bash
pi install https://github.com/zeflq/pi-reviewer
```

Then inside the pi TUI, use the `/review` command:

```
/review
/review --branch dev
/review --pr 42
/review --diff HEAD~1
/review --dry-run
```

| Option | Description | Example |
|---|---|---|
| `--branch <name>` | Compare current branch against this branch (default: auto-detected from `origin/HEAD`) | `--branch dev` |
| `--pr <number>` | Fetch and review a specific PR diff via `gh` CLI | `--pr 42` |
| `--diff <ref>` | Review changes since a specific git ref | `--diff HEAD~1` |
| `--dry-run` | Print the diff and prompt without calling the agent | |

The review output is saved to `pi-review.md` in your project root.

**What gets included in the diff**

`/review` and `--branch` use `git merge-base` to diff from the point where your branch diverged — this includes committed changes, staged files, and unstaged edits. You don't need to commit before reviewing.

`--diff` and `--pr` use the exact ref or remote diff as-is (no working tree changes).

The status bar shows which branches are being compared:
```
Reviewing feature/my-branch vs origin/develop...
```

## Project conventions

Create `AGENTS.md` at the root of your project to give the reviewer context about your conventions, patterns, and decisions. The agent reads it before every review — both in CI and locally via the pi extension.

```markdown
# Project Conventions

## Function Naming
- Prefix async data fetchers with `fetch` (e.g. `fetchUser`, `fetchOrders`)
- Prefix boolean functions with `is`, `has`, or `can`
- Prefix mutations with a verb: `update`, `delete`, `create`, `reset`
```

## Bot identity

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
      anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

The review comment will then appear under your GitHub App's name (e.g. `my-bot[bot]`).

# CI Agent

Runs on every pull request via GitHub Actions. The agent posts an inline review comment directly on the PR using the GitHub Reviews API.

## Setup

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
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: zeflq/pi-reviewer@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pi-api-key: ${{ secrets.PI_API_KEY }}
          model: openrouter/openai/gpt-5.4-mini
          min-severity: ${{ inputs.min-severity || 'info' }}
          # Opt in to injecting matching project docs into the review.
          # Comma-separated dirs scanned for .md files with a 'description' frontmatter.
          # doc-dirs: '.pi/notes,docs/review'
```

Commit it to your default branch, then add your API key to your repo secrets:
- `PI_API_KEY` — the API key **for the provider in `model`**. The action forwards this key to that model's endpoint, so it must match the provider. For `openrouter/...` use an OpenRouter key (`sk-or-...`); for `anthropic/...` an Anthropic key; etc.

## Usage

Every pull request triggers an automatic review comment posted by `github-actions[bot]`. You can also trigger a review manually via **Actions → Pi Reviewer → Run workflow** to select the minimum severity level.

## Inputs

| Input | Required | Description |
|---|---|---|
| `github-token` | yes | GitHub token to post PR comments |
| `pi-api-key` | yes | API key for the model's provider (forwarded to the model endpoint; e.g. an OpenRouter `sk-or-...` key for `openrouter/...` models) |
| `model` | yes | Model to use in `provider/modelId` format (e.g. `openrouter/openai/gpt-5.4-mini`) |
| `post-comment` | no | Post review as a GitHub PR comment (default: `true`) |
| `min-severity` | no | Minimum severity: `info`, `warn`, or `critical` (default: `info`) |
| `doc-dirs` | no | Comma-separated dirs to scan for docs to inject into the review (default: empty — inject nothing) |

## Doc context

The reviewer can pull relevant project documentation into the review prompt based on which files changed in the diff. It is **opt-in** in CI: nothing is injected unless you set `doc-dirs`.

```yaml
      - uses: zeflq/pi-reviewer@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pi-api-key: ${{ secrets.PI_API_KEY }}
          doc-dirs: '.pi/notes,docs/review'
```

For each configured dir, any `.md` file with a `description` frontmatter field is a candidate:

```markdown
---
description: Authentication flows, JWT tokens, session management
---

# Auth Guide

...content injected into the review when auth-related files change...
```

At review time, the action extracts keywords from the changed file paths (e.g. `src/auth/login.ts` → `auth`, `login`), then injects any doc whose `description` or filename matches a keyword. Keep descriptions specific enough to avoid over-matching, but broad enough to cover the files they apply to.

## Bot identity

By default, comments appear under `github-actions[bot]`. To post under a custom bot name, create a GitHub App:

1. Go to `github.com/settings/apps/new`, set **Pull requests** permission to **Write**, disable the webhook
2. Install the app on your repository
3. Generate a **private key** and note the **App ID**
4. Add `BOT_APP_ID` and `BOT_PRIVATE_KEY` to your repo secrets

Then update your workflow:

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
      model: openrouter/openai/gpt-5.4-mini
      min-severity: ${{ inputs.min-severity || 'info' }}
```

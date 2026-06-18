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
- `PI_API_KEY` — your [pi](https://github.com/mariozechner/pi) API key

## Usage

Every pull request triggers an automatic review comment posted by `github-actions[bot]`. You can also trigger a review manually via **Actions → Pi Reviewer → Run workflow** to select the minimum severity level.

## Inputs

| Input | Required | Description |
|---|---|---|
| `github-token` | yes | GitHub token to post PR comments |
| `pi-api-key` | yes | pi API key |
| `model` | no | Model to use in `provider/modelId` format (e.g. `anthropic/claude-opus-4-6`) |
| `post-comment` | no | Post review as a GitHub PR comment (default: `true`) |
| `min-severity` | no | Minimum severity: `info`, `warn`, or `critical` (default: `info`) |
| `setup-node` | no | Set up Node 24 via `actions/setup-node` (default: `true`). Disable if the runner image already provides Node. |
| `cache` | no | Cache the pnpm store across runs (default: `true`). Disable on runners where the cache service is unavailable or unwanted. |

The action runs on Node 24 (LTS). Deps are installed with [pnpm](https://pnpm.io); the pnpm store is cached by a standalone `actions/cache` step keyed on a hash of `pnpm-lock.yaml`, so warm runs skip the download. The cache step uses `continue-on-error`, so a cache failure degrades to an uncached install rather than aborting the review.

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
      min-severity: ${{ inputs.min-severity || 'info' }}
```

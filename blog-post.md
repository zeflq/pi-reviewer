# Why AI Code Review Fails Without Project Context

Every AI code review starts the same way.

The bot opens your PR. It scans the diff. It flags a missing `try/catch`, suggests a more descriptive variable name, and notes that you could memoize that function for performance.

All technically correct. None of it useful.

Because it doesn't know that `fetchUser` is an intentional naming convention your team enforces. That error handling is delegated to a global boundary. That performance isn't the concern here — correctness is. The bot doesn't know your project. It never did.

This isn't a model problem. It's a **context problem**.

## What generic review misses

When a senior engineer reviews your PR, they're not just checking syntax. They're checking it against everything they know about the project — the decisions, the trade-offs, the rules the team settled on last quarter. That's the review that actually matters.

A generic AI reviewer only gets the diff. It has no idea that your API endpoints must be versioned under `/api/v1/`, that all `fetch` calls require a `res.ok` check, or that `getData` is a banned function name. It can't enforce what it doesn't know.

So you get a review full of noise — and silence on the things that actually matter.

## How it compares to Claude Code PR Review

Anthropic recently shipped [Code Review](https://code.claude.com/docs/en/code-review) — a managed PR review service built into Claude Code. It reads `CLAUDE.md` and `REVIEW.md`, runs multiple specialized agents against your full codebase in parallel, and posts inline findings with severity tags. It's genuinely impressive.

But it comes with constraints that may not fit your setup.

It's a **managed service** — it runs on Anthropic's infrastructure, requires a GitHub App installation, and is available on Teams and Enterprise plans only. Reviews average $15–25 each. You don't control the infrastructure, and it's Claude-only.

`pi-reviewer` takes a different approach: it runs in your own CI pipeline, costs what your token usage costs, works with any model through the pi agent, and needs nothing more than a secret and a workflow file. No GitHub App. No admin approval flow. No managed infrastructure.

And if you want to review locally before you push — without opening a PR at all — the pi TUI extension gives you `/review` in your terminal, including SSH mode for remote machines.

Both tools read your `CLAUDE.md` and `REVIEW.md`. The difference is where they run, what they cost, and how much control you keep.

## The missing layer: project context

`pi-reviewer` is a GitHub Action and pi TUI extension that runs AI code review — but with your project baked in.

Before the agent sees a single line of diff, it reads:

- **`AGENTS.md` or `CLAUDE.md`** — your general project conventions: naming rules, architecture decisions, patterns to follow
- **`REVIEW.md`** — review-specific rules: what to always flag, what to explicitly skip

Markdown links in those files are followed recursively. If your `AGENTS.md` links to `docs/api-conventions.md`, that file gets inlined too. The agent sees the full picture, not just the summary.

```markdown
# Review Guidelines

## Always flag
- `fetch` calls missing `res.ok` check before `.json()`
- API endpoints not versioned under `/api/v1/`
- Functions named `getData`, `doStuff`, or other generic names

## Skip
- Formatting-only changes
- Changes inside `pi-review.md`
```

That's a `REVIEW.md`. The agent now knows what *your team* cares about — not what a generic model thinks good code looks like.

## What a context-aware review looks like

Here's what changed after adding project context.

Before: the agent flagged a missing type annotation on an internal helper. Suggested renaming a variable. Noted a `console.log` left in.

After: it caught an unversioned API endpoint added in the same PR. Flagged a `fetch` call missing the `res.ok` check — exactly the rule in `REVIEW.md`. Skipped the formatting-only change in the generated file, as instructed.

Same model. Same diff. Completely different review.

## Severity you control

Not every finding deserves equal weight. `pi-reviewer` lets you filter by severity — so you can focus on what matters.

```yaml
- uses: zeflq/pi-reviewer@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    pi-api-key: ${{ secrets.PI_API_KEY }}
    min-severity: warn
```

Set `min-severity: warn` and the agent skips INFO-level suggestions entirely — both in what it generates and in what gets posted to the PR. You can also trigger a manual review from the GitHub Actions UI and choose the severity level on the fly.

Three tiers: 🔴 CRITICAL for bugs and security issues, 🟡 WARN for logic and type errors, 🔵 INFO for style and suggestions.

## Model-agnostic, works anywhere

`pi-reviewer` runs on the [pi agent](https://github.com/mariozechner/pi) — not tied to a single provider. One `PI_API_KEY` works across all supported models. You pick the model, pi handles the rest.

It also works over SSH. If your project lives on a remote machine, `--ssh` mode lets the agent fetch the diff and read your conventions directly on the remote — no local copy needed.

## Set it up once, forget about it

```bash
npx github:zeflq/pi-reviewer init
```

That generates a workflow file. Add your `PI_API_KEY` secret. Every PR from that point on gets a review that knows your project.

The context files — `AGENTS.md`, `REVIEW.md` — live in your repo. They're version-controlled, team-editable, and evolve with the project. The better you document your conventions, the better the reviews get.

## The shift

The insight isn't that AI can review code. It's that AI review without project context is just another linter with better prose.

The review that matters is the one that knows *why* your codebase looks the way it does — and checks the diff against that, not against some generic idea of good software.

That's the layer that's been missing.

**[github.com/zeflq/pi-reviewer](https://github.com/zeflq/pi-reviewer)**

---

*Context is everything. Diff without it is just noise.*

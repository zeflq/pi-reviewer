import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export interface InitOptions {
  cwd?: string;
}

const WORKFLOW_RELATIVE_PATH = path.join(".github", "workflows", "pi-review.yml");

const WORKFLOW_CONTENT = `name: Pi Reviewer

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
          github-token: \${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
          min-severity: \${{ inputs.min-severity || 'info' }}
`;

export async function init(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const workflowPath = path.join(cwd, WORKFLOW_RELATIVE_PATH);

  if (existsSync(workflowPath)) {
    console.log("pi-review.yml already exists. Skipping.");
    return;
  }

  mkdirSync(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, WORKFLOW_CONTENT, "utf-8");

  console.log("✓ Created .github/workflows/pi-review.yml");
  console.log("");
  console.log("Next step: add your project conventions to AGENTS.md at the root of your project.");
  console.log(
    "This file will be used by the reviewer to understand your project's rules and patterns."
  );
}

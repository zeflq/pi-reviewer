import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { init } from "../src/init.js";

const createdDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-reviewer-init-"));
  createdDirs.push(dir);
  return dir;
}

describe("init", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("generates workflow file with correct content", async () => {
    const dir = await createTempDir();

    await init({ cwd: dir });

    const workflowPath = path.join(dir, ".github", "workflows", "pi-review.yml");
    const content = await readFile(workflowPath, "utf-8");

    expect(content).toBe(`name: Pi Reviewer

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
          pi-api-key: \${{ secrets.PI_API_KEY }}
          min-severity: \${{ inputs.min-severity || 'info' }}
`);
  });

  it("creates intermediate directories when missing", async () => {
    const dir = await createTempDir();

    await init({ cwd: dir });

    const workflowPath = path.join(dir, ".github", "workflows", "pi-review.yml");
    const content = await readFile(workflowPath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("skips without overwriting when file already exists", async () => {
    const dir = await createTempDir();
    const workflowPath = path.join(dir, ".github", "workflows", "pi-review.yml");

    await init({ cwd: dir });
    await writeFile(workflowPath, "custom content", "utf-8");

    await init({ cwd: dir });

    const content = await readFile(workflowPath, "utf-8");
    expect(content).toBe("custom content");
    expect(logSpy).toHaveBeenCalledWith("pi-review.yml already exists. Skipping.");
  });

  it("prints success and next-step instructions after generation", async () => {
    const dir = await createTempDir();

    await init({ cwd: dir });

    expect(logSpy).toHaveBeenCalledWith("✓ Created .github/workflows/pi-review.yml");
    expect(logSpy).toHaveBeenCalledWith(
      "Next step: add your project conventions to AGENTS.md at the root of your project."
    );
    expect(logSpy).toHaveBeenCalledWith(
      "This file will be used by the reviewer to understand your project's rules and patterns."
    );
  });
});

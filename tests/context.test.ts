import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadContext } from "../src/context.js";

const createdDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-reviewer-context-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("loadContext", () => {
  it("returns conventions when AGENTS.md exists", async () => {
    const dir = await createTempDir();
    const content = "# Conventions\n- Keep functions small\n";
    await writeFile(path.join(dir, "AGENTS.md"), content, "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toBe(content);
    expect(result.reviewRules).toBe("");
  });

  it("returns conventions from CLAUDE.md when AGENTS.md does not exist", async () => {
    const dir = await createTempDir();
    const content = "# Claude conventions\n- Use TypeScript\n";
    await writeFile(path.join(dir, "CLAUDE.md"), content, "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toBe(content);
    expect(result.reviewRules).toBe("");
  });

  it("prefers AGENTS.md over CLAUDE.md when both exist", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "agents content", "utf-8");
    await writeFile(path.join(dir, "CLAUDE.md"), "claude content", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toBe("agents content");
  });

  it("returns empty conventions when neither AGENTS.md nor CLAUDE.md exists", async () => {
    const dir = await createTempDir();

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toBe("");
    expect(result.reviewRules).toBe("");
  });

  it("returns reviewRules when REVIEW.md exists", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "conventions", "utf-8");
    await writeFile(path.join(dir, "REVIEW.md"), "# Review rules\n- Always check res.ok\n", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toBe("conventions");
    expect(result.reviewRules).toBe("# Review rules\n- Always check res.ok\n");
  });

  it("returns reviewRules even when no conventions file exists", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "REVIEW.md"), "review only rules", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toBe("");
    expect(result.reviewRules).toBe("review only rules");
  });

  it("uses process.cwd() when cwd option is not provided", async () => {
    const dir = await createTempDir();
    const oldCwd = process.cwd();
    await writeFile(path.join(dir, "AGENTS.md"), "project context", "utf-8");

    try {
      process.chdir(dir);
      const result = await loadContext();
      expect(result.conventions).toBe("project context");
    } finally {
      process.chdir(oldCwd);
    }
  });

  it("inlines linked .md files referenced in AGENTS.md", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "Main content\n\n[api conventions](./docs/api.md)\n", "utf-8");
    await mkdir(path.join(dir, "docs"));
    await writeFile(path.join(dir, "docs", "api.md"), "API rules here", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toContain("Main content");
    expect(result.conventions).toContain("API rules here");
    expect(result.conventions).not.toContain("[api conventions](./docs/api.md)");
  });

  it("inlines nested linked .md files recursively", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "Root\n\n[level1](./level1.md)\n", "utf-8");
    await writeFile(path.join(dir, "level1.md"), "Level1\n\n[level2](./level2.md)\n", "utf-8");
    await writeFile(path.join(dir, "level2.md"), "Level2 content", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toContain("Root");
    expect(result.conventions).toContain("Level1");
    expect(result.conventions).toContain("Level2 content");
  });

  it("does not inline http links", async () => {
    const dir = await createTempDir();
    const content = "See [docs](https://example.com/docs.md) for more.\n";
    await writeFile(path.join(dir, "AGENTS.md"), content, "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toBe(content);
  });

  it("ignores missing linked files gracefully", async () => {
    const dir = await createTempDir();
    const content = "Main\n\n[missing](./nonexistent.md)\n";
    await writeFile(path.join(dir, "AGENTS.md"), content, "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toBe(content);
  });

  it("prevents infinite loops from circular links", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "Root\n\n[a](./a.md)\n", "utf-8");
    await writeFile(path.join(dir, "a.md"), "A content\n\n[back](./AGENTS.md)\n", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toContain("Root");
    expect(result.conventions).toContain("A content");
  });

  it("inlines links in REVIEW.md", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "REVIEW.md"), "Rules\n\n[details](./review-details.md)\n", "utf-8");
    await writeFile(path.join(dir, "review-details.md"), "Detailed rules", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.reviewRules).toContain("Rules");
    expect(result.reviewRules).toContain("Detailed rules");
  });
});

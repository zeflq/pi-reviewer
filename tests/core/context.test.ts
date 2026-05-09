import { execSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadContext, walkUpContextFiles, collectProviderContext, CONTEXT_PROVIDER_EVENT } from "../../src/core/context.js";
import type { ContextProviderEvent, MinimalEventBus, ContextGroup } from "../../src/core/context.js";
import { localFs } from "../../src/core/ssh.js";

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

    expect(result.conventions).toEqual([{ path: "AGENTS.md", content }]);
    expect(result.reviewRules).toEqual([]);
  });

  it("returns conventions from CLAUDE.md when AGENTS.md does not exist", async () => {
    const dir = await createTempDir();
    const content = "# Claude conventions\n- Use TypeScript\n";
    await writeFile(path.join(dir, "CLAUDE.md"), content, "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toEqual([{ path: "CLAUDE.md", content }]);
    expect(result.reviewRules).toEqual([]);
  });

  it("prefers AGENTS.md over CLAUDE.md when both exist", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "agents content", "utf-8");
    await writeFile(path.join(dir, "CLAUDE.md"), "claude content", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toEqual([{ path: "AGENTS.md", content: "agents content" }]);
  });

  it("returns empty arrays when neither AGENTS.md nor CLAUDE.md exists", async () => {
    const dir = await createTempDir();

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toEqual([]);
    expect(result.reviewRules).toEqual([]);
  });

  it("returns reviewRules when REVIEW.md exists", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "conventions", "utf-8");
    await writeFile(path.join(dir, "REVIEW.md"), "# Review rules\n- Always check res.ok\n", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toEqual([{ path: "AGENTS.md", content: "conventions" }]);
    expect(result.reviewRules).toEqual([{ path: "REVIEW.md", content: "# Review rules\n- Always check res.ok\n" }]);
  });

  it("returns reviewRules even when no conventions file exists", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "REVIEW.md"), "review only rules", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toEqual([]);
    expect(result.reviewRules).toEqual([{ path: "REVIEW.md", content: "review only rules" }]);
  });

  it("uses process.cwd() when cwd option is not provided", async () => {
    const dir = await createTempDir();
    const oldCwd = process.cwd();
    await writeFile(path.join(dir, "AGENTS.md"), "project context", "utf-8");

    try {
      process.chdir(dir);
      const result = await loadContext();
      expect(result.conventions[0].content).toBe("project context");
    } finally {
      process.chdir(oldCwd);
    }
  });

  it("loads AGENTS.md from .pi/ when not at root", async () => {
    const dir = await createTempDir();
    await mkdir(path.join(dir, ".pi"));
    await writeFile(path.join(dir, ".pi", "AGENTS.md"), "pi-dir conventions", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions).toEqual([{ path: path.join(".pi", "AGENTS.md"), content: "pi-dir conventions" }]);
  });

  it("prefers root AGENTS.md over .pi/AGENTS.md", async () => {
    const dir = await createTempDir();
    await mkdir(path.join(dir, ".pi"));
    await writeFile(path.join(dir, "AGENTS.md"), "root conventions", "utf-8");
    await writeFile(path.join(dir, ".pi", "AGENTS.md"), "pi-dir conventions", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.conventions[0].content).toBe("root conventions");
  });

  it("loads REVIEW.md from .pi/ when not at root", async () => {
    const dir = await createTempDir();
    await mkdir(path.join(dir, ".pi"));
    await writeFile(path.join(dir, ".pi", "REVIEW.md"), "pi-dir review rules", "utf-8");

    const result = await loadContext({ cwd: dir });

    expect(result.reviewRules).toEqual([{ path: path.join(".pi", "REVIEW.md"), content: "pi-dir review rules" }]);
  });
});

describe("loadContext — monorepo (git root walk-up)", () => {
  it("collects AGENTS.md from both root and package dir", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-reviewer-mono-"));
    createdDirs.push(root);
    execSync("git init", { cwd: root, stdio: "ignore" });

    const pkgDir = path.join(root, "packages", "api");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(root, "AGENTS.md"), "root conventions", "utf-8");
    await writeFile(path.join(pkgDir, "AGENTS.md"), "api conventions", "utf-8");

    const result = await loadContext({ cwd: pkgDir });

    expect(result.conventions).toHaveLength(2);
    expect(result.conventions[0]).toEqual({ path: path.join("..", "..", "AGENTS.md"), content: "root conventions" });
    expect(result.conventions[1]).toEqual({ path: "AGENTS.md", content: "api conventions" });
  });

  it("collects REVIEW.md from both root and package dir", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-reviewer-mono-"));
    createdDirs.push(root);
    execSync("git init", { cwd: root, stdio: "ignore" });

    const pkgDir = path.join(root, "packages", "api");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(root, "REVIEW.md"), "root review rules", "utf-8");
    await writeFile(path.join(pkgDir, "REVIEW.md"), "api review rules", "utf-8");

    const result = await loadContext({ cwd: pkgDir });

    expect(result.reviewRules).toHaveLength(2);
    expect(result.reviewRules[0].content).toBe("root review rules");
    expect(result.reviewRules[1].content).toBe("api review rules");
  });

  it("works with only root AGENTS.md when running from a package dir", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-reviewer-mono-"));
    createdDirs.push(root);
    execSync("git init", { cwd: root, stdio: "ignore" });

    const pkgDir = path.join(root, "packages", "api");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(root, "AGENTS.md"), "root conventions", "utf-8");

    const result = await loadContext({ cwd: pkgDir });

    expect(result.conventions).toHaveLength(1);
    expect(result.conventions[0].content).toBe("root conventions");
  });

  it("finds root AGENTS.md and package REVIEW.md when cwd is the package dir (--dir equivalent)", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-reviewer-mono-"));
    createdDirs.push(root);
    execSync("git init", { cwd: root, stdio: "ignore" });

    const pkgDir = path.join(root, "project-x");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(root, "AGENTS.md"), "root conventions", "utf-8");
    await writeFile(path.join(pkgDir, "REVIEW.md"), "package review rules", "utf-8");

    const result = await loadContext({ cwd: pkgDir });

    expect(result.conventions).toHaveLength(1);
    expect(result.conventions[0].content).toBe("root conventions");
    expect(result.reviewRules).toHaveLength(1);
    expect(result.reviewRules[0].content).toBe("package review rules");
  });

  it("gitRoot override walks up to the specified boundary (--dir with nested git repo)", async () => {
    const root = await createTempDir();
    const pkgDir = path.join(root, "project-x");
    await mkdir(pkgDir, { recursive: true });

    await writeFile(path.join(root, "AGENTS.md"), "root conventions", "utf-8");
    await writeFile(path.join(root, "REVIEW.md"), "root review rules", "utf-8");
    await writeFile(path.join(pkgDir, "AGENTS.md"), "pkg conventions", "utf-8");

    // gitRoot override forces walk-up to root even when pkgDir has its own .git
    const result = await loadContext({ cwd: pkgDir, gitRoot: root });

    expect(result.conventions).toHaveLength(2);
    expect(result.conventions[0].content).toBe("root conventions");
    expect(result.conventions[1].content).toBe("pkg conventions");
    expect(result.reviewRules).toHaveLength(1);
    expect(result.reviewRules[0].content).toBe("root review rules");
  });
});

describe("walkUpContextFiles", () => {
  it("returns empty array when no files exist", async () => {
    const dir = await createTempDir();

    const result = await walkUpContextFiles(localFs(), dir, ["AGENTS.md", "CLAUDE.md"], dir);

    expect(result).toEqual([]);
  });

  it("returns single file when found at cwd level", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "conventions", "utf-8");

    const result = await walkUpContextFiles(localFs(), dir, ["AGENTS.md", "CLAUDE.md"], dir);

    expect(result).toEqual([{ path: "AGENTS.md", content: "conventions" }]);
  });

  it("picks first matching filename at each level", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "AGENTS.md"), "agents", "utf-8");
    await writeFile(path.join(dir, "CLAUDE.md"), "claude", "utf-8");

    const result = await walkUpContextFiles(localFs(), dir, ["AGENTS.md", "CLAUDE.md"], dir);

    expect(result).toEqual([{ path: "AGENTS.md", content: "agents" }]);
  });

  it("collects one file per directory level, root → cwd", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-reviewer-walk-"));
    createdDirs.push(root);
    execSync("git init", { cwd: root, stdio: "ignore" });

    const pkgDir = path.join(root, "packages", "api");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(root, "AGENTS.md"), "root", "utf-8");
    await writeFile(path.join(pkgDir, "AGENTS.md"), "api", "utf-8");

    const result = await walkUpContextFiles(localFs(), pkgDir, ["AGENTS.md", "CLAUDE.md"], root);

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("root");
    expect(result[1].content).toBe("api");
  });

  it("stops at gitRoot — does not collect files above it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pi-reviewer-walk-"));
    createdDirs.push(root);
    execSync("git init", { cwd: root, stdio: "ignore" });

    const pkgDir = path.join(root, "packages", "api");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(path.join(root, "AGENTS.md"), "root", "utf-8");

    // gitRoot is root, so walk stops at root even though parent dirs might have files
    const result = await walkUpContextFiles(localFs(), pkgDir, ["AGENTS.md", "CLAUDE.md"], root);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("root");
  });

  it("finds files in config subdirs (.pi, .claude, .agents)", async () => {
    const dir = await createTempDir();
    await mkdir(path.join(dir, ".pi"));
    await writeFile(path.join(dir, ".pi", "AGENTS.md"), "pi conventions", "utf-8");

    const result = await walkUpContextFiles(localFs(), dir, ["AGENTS.md", "CLAUDE.md"], dir);

    expect(result).toEqual([{ path: path.join(".pi", "AGENTS.md"), content: "pi conventions" }]);
  });
});

function createStubEventBus(): MinimalEventBus & { _emit(channel: string, data: unknown): void } {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    emit(channel, data) {
      for (const h of handlers.get(channel) ?? []) h(data);
    },
    on(channel, handler) {
      if (!handlers.has(channel)) handlers.set(channel, []);
      handlers.get(channel)!.push(handler);
      return () => {};
    },
    _emit(channel, data) { this.emit(channel, data); },
  };
}

describe("collectProviderContext", () => {
  it("returns empty array when no providers are registered", async () => {
    const events = createStubEventBus();
    const result = await collectProviderContext(events, "/project", ["src/foo.ts"]);
    expect(result).toEqual([]);
  });

  it("calls registered provider with cwd and diffFiles", async () => {
    const events = createStubEventBus();
    const provider = vi.fn().mockResolvedValue([]);
    events.on(CONTEXT_PROVIDER_EVENT, (data) => {
      const { register } = data as ContextProviderEvent;
      register("test-ext", provider);
    });

    await collectProviderContext(events, "/project", ["src/foo.ts"]);

    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/project", diffFiles: ["src/foo.ts"] }));
  });

  it("returns a group with files from a registered provider", async () => {
    const events = createStubEventBus();
    events.on(CONTEXT_PROVIDER_EVENT, (data) => {
      const { register } = data as ContextProviderEvent;
      register("test-ext", async () => [{ path: "docs/arch.md", content: "Architecture" }]);
    });

    const result = await collectProviderContext(events, "/project", []);

    expect(result).toEqual<ContextGroup[]>([
      { name: "test-ext", files: [{ path: "docs/arch.md", content: "Architecture" }] },
    ]);
  });

  it("returns one group per provider", async () => {
    const events = createStubEventBus();
    events.on(CONTEXT_PROVIDER_EVENT, (data) => {
      const { register } = data as ContextProviderEvent;
      register("ext-a", async () => [{ path: "docs/a.md", content: "A" }]);
      register("ext-b", async () => [{ path: "docs/b.md", content: "B" }]);
    });

    const result = await collectProviderContext(events, "/project", []);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "ext-a", files: [{ path: "docs/a.md", content: "A" }] });
    expect(result[1]).toEqual({ name: "ext-b", files: [{ path: "docs/b.md", content: "B" }] });
  });

  it("omits groups when provider returns empty array", async () => {
    const events = createStubEventBus();
    events.on(CONTEXT_PROVIDER_EVENT, (data) => {
      const { register } = data as ContextProviderEvent;
      register("empty-ext", async () => []);
    });

    const result = await collectProviderContext(events, "/project", []);

    expect(result).toHaveLength(0);
  });

  it("passes diffFiles so providers can filter by changed files", async () => {
    const events = createStubEventBus();
    events.on(CONTEXT_PROVIDER_EVENT, (data) => {
      const { register, diffFiles } = data as ContextProviderEvent;
      register("test-ext", async () =>
        diffFiles.some(f => f.startsWith("src/auth/"))
          ? [{ path: "docs/auth.md", content: "Auth docs" }]
          : [],
      );
    });

    const withMatch = await collectProviderContext(events, "/project", ["src/auth/login.ts"]);
    const withoutMatch = await collectProviderContext(events, "/project", ["src/utils.ts"]);

    expect(withMatch).toHaveLength(1); // 1 group
    expect(withoutMatch).toHaveLength(0); // filtered out (empty files)
  });
});

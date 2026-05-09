/**
 * Integration tests: SSH context loading via a fake FsOps transport.
 * No real SSH connection — sshFs is replaced with an in-memory file tree.
 * This exercises the full loadContextSSH → walkUpContextFiles pipeline.
 */

vi.mock("../../src/core/ssh.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/ssh.js")>();
  return { ...actual, sshExec: vi.fn(), sshFs: vi.fn() };
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { posix } from "node:path";
import { sshExec, sshFs, type FsOps } from "../../src/core/ssh.js";
import { loadContextSSH } from "../../src/core/context.js";

/** Builds a fake FsOps backed by an in-memory map of absolute posix paths → content. */
function makeFakeSshFs(files: Record<string, string>): FsOps {
  return {
    async read(p) { return files[p] ?? null; },
    async list(dir) {
      return Object.keys(files)
        .filter(p => posix.dirname(p) === dir)
        .map(p => posix.basename(p));
    },
    join: posix.join,
    dirname: posix.dirname,
    relative: posix.relative,
  };
}

beforeEach(() => {
  // Default: git root is /remote/root; overridden per test where needed
  vi.mocked(sshExec).mockResolvedValue("/remote/root\n");
});

describe("loadContextSSH — .pi/ subdir", () => {
  it("reads AGENTS.md and REVIEW.md from .pi/", async () => {
    vi.mocked(sshFs).mockReturnValue(makeFakeSshFs({
      "/remote/root/.pi/AGENTS.md": "# SSH Pi Conventions",
      "/remote/root/.pi/REVIEW.md": "# SSH Pi Review Rules",
    }));

    const result = await loadContextSSH("user@host", "/remote/root");

    expect(result.conventions[0]?.content).toBe("# SSH Pi Conventions");
    expect(result.reviewRules[0]?.content).toBe("# SSH Pi Review Rules");
  });

  it("reads root-level AGENTS.md and REVIEW.md", async () => {
    vi.mocked(sshFs).mockReturnValue(makeFakeSshFs({
      "/remote/root/AGENTS.md": "# SSH Root Conventions",
      "/remote/root/REVIEW.md": "# SSH Root Review Rules",
    }));

    const result = await loadContextSSH("user@host", "/remote/root");

    expect(result.conventions[0]?.content).toBe("# SSH Root Conventions");
    expect(result.reviewRules[0]?.content).toBe("# SSH Root Review Rules");
  });
});

describe("loadContextSSH — monorepo walk-up", () => {
  it("collects root AGENTS.md and package REVIEW.md when cwd is a nested package", async () => {
    vi.mocked(sshFs).mockReturnValue(makeFakeSshFs({
      "/remote/root/AGENTS.md": "# SSH Monorepo Conventions",
      "/remote/root/packages/api/REVIEW.md": "# SSH Package Review Rules",
    }));
    // git root is /remote/root; cwd is the nested package
    vi.mocked(sshExec).mockResolvedValue("/remote/root\n");

    const result = await loadContextSSH("user@host", "/remote/root/packages/api");

    expect(result.conventions[0]?.content).toBe("# SSH Monorepo Conventions");
    expect(result.reviewRules[0]?.content).toBe("# SSH Package Review Rules");
  });

  it("collects both root and package AGENTS.md in root → cwd order", async () => {
    vi.mocked(sshFs).mockReturnValue(makeFakeSshFs({
      "/remote/root/AGENTS.md": "# Root Level",
      "/remote/root/packages/api/AGENTS.md": "# Package Level",
    }));
    vi.mocked(sshExec).mockResolvedValue("/remote/root\n");

    const result = await loadContextSSH("user@host", "/remote/root/packages/api");

    expect(result.conventions).toHaveLength(2);
    expect(result.conventions[0]?.content).toBe("# Root Level");
    expect(result.conventions[1]?.content).toBe("# Package Level");
  });
});

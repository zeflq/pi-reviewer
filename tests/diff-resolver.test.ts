import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { resolveDiff } from "../src/diff-resolver.js";

const execSyncMock = vi.mocked(execSync);

describe("resolveDiff", () => {
  beforeEach(() => {
    execSyncMock.mockReset();
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_BASE_REF;
  });

  it("uses gh pr diff for --pr", async () => {
    execSyncMock.mockReturnValue("diff --git a/file b/file\n");

    const result = await resolveDiff({ pr: 42, cwd: "/repo" });

    expect(execSyncMock).toHaveBeenCalledWith("gh pr diff 42", {
      cwd: "/repo",
      encoding: "utf-8",
    });
    expect(result.source).toBe("PR #42");
  });

  it("uses git diff <ref> for --diff", async () => {
    execSyncMock.mockReturnValue("some-diff");

    const result = await resolveDiff({ diff: "HEAD~2", cwd: "/repo" });

    expect(execSyncMock).toHaveBeenCalledWith("git diff HEAD~2", {
      cwd: "/repo",
      encoding: "utf-8",
    });
    expect(result.source).toBe("git diff HEAD~2");
  });

  it("uses git diff <branch>...HEAD for --branch", async () => {
    execSyncMock
      .mockReturnValueOnce("feature-branch\n") // detectCurrentBranch
      .mockReturnValueOnce("some-diff");        // git diff dev...HEAD

    const result = await resolveDiff({ branch: "dev", cwd: "/repo" });

    expect(execSyncMock).toHaveBeenNthCalledWith(1, "git rev-parse --abbrev-ref HEAD", {
      cwd: "/repo",
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(execSyncMock).toHaveBeenNthCalledWith(2, "git diff dev...HEAD", {
      cwd: "/repo",
      encoding: "utf-8",
    });
    expect(result.source).toBe("git diff dev...feature-branch");
  });

  it("uses CI base branch when in GitHub Actions", async () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.GITHUB_BASE_REF = "main";
    execSyncMock
      .mockReturnValueOnce("feature-branch\n") // detectCurrentBranch
      .mockReturnValueOnce("some-diff");        // git diff origin/main...HEAD

    const result = await resolveDiff({ cwd: "/repo" });

    expect(execSyncMock).toHaveBeenNthCalledWith(1, "git rev-parse --abbrev-ref HEAD", {
      cwd: "/repo",
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(execSyncMock).toHaveBeenNthCalledWith(2, "git diff origin/main...HEAD", {
      cwd: "/repo",
      encoding: "utf-8",
    });
    expect(result.source).toBe("git diff origin/main...feature-branch");
  });

  it("auto-detects local base branch from origin/HEAD", async () => {
    execSyncMock
      .mockReturnValueOnce("feature-branch\n") // detectCurrentBranch
      .mockReturnValueOnce("origin/main\n")    // detectOriginBase
      .mockReturnValueOnce("some-diff");        // git diff origin/main...HEAD

    const result = await resolveDiff({ cwd: "/repo" });

    expect(execSyncMock).toHaveBeenNthCalledWith(1, "git rev-parse --abbrev-ref HEAD", {
      cwd: "/repo",
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(execSyncMock).toHaveBeenNthCalledWith(
      2,
      "git symbolic-ref refs/remotes/origin/HEAD --short",
      {
        cwd: "/repo",
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    expect(execSyncMock).toHaveBeenNthCalledWith(3, "git diff origin/main...HEAD", {
      cwd: "/repo",
      encoding: "utf-8",
    });
    expect(result.source).toBe("git diff origin/main...feature-branch");
  });

  it("falls back to origin/main when base branch detection fails", async () => {
    execSyncMock
      .mockReturnValueOnce("feature-branch\n") // detectCurrentBranch
      .mockImplementationOnce(() => {
        throw new Error("symbolic-ref failed");
      })
      .mockReturnValueOnce("some-diff");

    const result = await resolveDiff({ cwd: "/repo" });

    expect(execSyncMock).toHaveBeenNthCalledWith(1, "git rev-parse --abbrev-ref HEAD", {
      cwd: "/repo",
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(execSyncMock).toHaveBeenNthCalledWith(
      2,
      "git symbolic-ref refs/remotes/origin/HEAD --short",
      {
        cwd: "/repo",
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    expect(execSyncMock).toHaveBeenNthCalledWith(3, "git diff origin/main...HEAD", {
      cwd: "/repo",
      encoding: "utf-8",
    });
    expect(result.source).toBe("git diff origin/main...feature-branch");
  });

  it("throws when resolved diff is empty", async () => {
    execSyncMock.mockReturnValue("   \n");

    await expect(resolveDiff({ diff: "HEAD~1", cwd: "/repo" })).rejects.toThrow(
      "No changes found. Make sure you are on a feature branch with commits ahead of the base."
    );
  });
});

import { describe, expect, it } from "vitest";
import { buildSSHDiffCommand } from "../../extensions/pi-reviewer/args.js";

describe("buildSSHDiffCommand", () => {
  it("uses gh pr diff for --pr", () => {
    expect(buildSSHDiffCommand({ pr: 42, dryRun: false, ssh: false, ui: false }))
      .toBe("gh pr diff 42");
  });

  it("uses git diff <ref> for --diff", () => {
    expect(buildSSHDiffCommand({ diff: "HEAD~2", dryRun: false, ssh: false, ui: false }))
      .toBe("git diff HEAD~2");
  });

  it("uses merge-base for --branch", () => {
    expect(buildSSHDiffCommand({ branch: "main", dryRun: false, ssh: false, ui: false }))
      .toBe("git diff $(git merge-base main HEAD)");
  });

  it("auto-detects origin default branch when no flags given", () => {
    const cmd = buildSSHDiffCommand({ dryRun: false, ssh: false, ui: false });
    expect(cmd).toContain("git symbolic-ref refs/remotes/origin/HEAD");
    expect(cmd).toContain("origin/main");
  });
});

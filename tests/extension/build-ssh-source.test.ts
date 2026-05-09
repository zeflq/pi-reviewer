import { describe, expect, it } from "vitest";

import { buildSSHSource } from "../../extensions/pi-reviewer/index.js";

describe("buildSSHSource", () => {
  it("returns PR label for --pr", () => {
    const result = buildSSHSource({ pr: 42 } as any);
    expect(result).toBe("PR #42");
  });

  it("returns git diff label for --diff", () => {
    const result = buildSSHSource({ diff: "HEAD~2" } as any);
    expect(result).toBe("git diff HEAD~2");
  });

  it("returns 'HEAD vs <branch>' for --branch", () => {
    const result = buildSSHSource({ branch: "develop" } as any);
    expect(result).toBe("HEAD vs develop");
  });

  it("uses detectedBase when no branch configured", () => {
    const result = buildSSHSource({} as any, { head: "feat/orders", detectedBase: "origin/main" });
    expect(result).toBe("feat/orders vs origin/main");
  });

  it("falls back to origin/HEAD when no branch and no detectedBase", () => {
    const result = buildSSHSource({} as any);
    expect(result).toBe("HEAD vs origin/HEAD");
  });

  it("uses branch opt from config over default", () => {
    const result = buildSSHSource({} as any, { branch: "develop" });
    expect(result).toBe("HEAD vs develop");
  });

  it("prefers parsed.branch over opts.branch", () => {
    const result = buildSSHSource({ branch: "feature/x" } as any, { branch: "develop" });
    expect(result).toBe("HEAD vs feature/x");
  });

  it("uses remote head from opts.head", () => {
    const result = buildSSHSource({} as any, { head: "feat/orders", branch: "develop" });
    expect(result).toBe("feat/orders vs develop");
  });

  it("falls back to HEAD when opts.head is not provided", () => {
    const result = buildSSHSource({} as any, { branch: "develop" });
    expect(result).toBe("HEAD vs develop");
  });
});

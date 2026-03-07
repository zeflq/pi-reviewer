import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_CHARS, filterDiff } from "../src/diff-filter.js";

function makeDiffSection(file: string, lines = "+"): string {
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n${lines}\n`;
}

describe("filterDiff", () => {
  it("passes clean diffs unchanged", () => {
    const raw = makeDiffSection("src/index.ts");
    const { diff, warning } = filterDiff(raw);
    expect(diff).toBe(raw);
    expect(warning).toBeUndefined();
  });

  it("excludes package-lock.json", () => {
    const raw = makeDiffSection("src/index.ts") + makeDiffSection("package-lock.json");
    const { diff, warning } = filterDiff(raw);
    expect(diff).not.toContain("package-lock.json");
    expect(warning).toMatch(/1 noise file excluded/);
    expect(warning).toContain("package-lock.json");
  });

  it("excludes yarn.lock", () => {
    const { diff, warning } = filterDiff(makeDiffSection("yarn.lock"));
    expect(diff.trim()).toBe("");
    expect(warning).toMatch(/yarn\.lock/);
  });

  it("excludes dist/ files", () => {
    const raw = makeDiffSection("src/index.ts") + makeDiffSection("dist/index.js");
    const { diff, warning } = filterDiff(raw);
    expect(diff).not.toContain("dist/index.js");
    expect(warning).toMatch(/dist\/index\.js/);
  });

  it("excludes multiple noise files and lists them", () => {
    const raw =
      makeDiffSection("src/index.ts") +
      makeDiffSection("package-lock.json") +
      makeDiffSection("yarn.lock");
    const { warning } = filterDiff(raw);
    expect(warning).toMatch(/2 noise files excluded/);
  });

  it("truncates diff exceeding maxChars", () => {
    const big = makeDiffSection("src/index.ts") + "x".repeat(200);
    const { diff, warning } = filterDiff(big, 50);
    expect(diff.length).toBe(50);
    expect(warning).toMatch(/truncated at 50 chars/);
  });

  it("combines noise exclusion and truncation warnings", () => {
    const raw = makeDiffSection("package-lock.json") + makeDiffSection("src/index.ts") + "x".repeat(200);
    const { warning } = filterDiff(raw, 50);
    expect(warning).toMatch(/noise file/);
    expect(warning).toMatch(/truncated/);
  });

  it("uses DEFAULT_MAX_CHARS by default", () => {
    const small = makeDiffSection("src/index.ts");
    const { diff } = filterDiff(small);
    expect(diff.length).toBeLessThanOrEqual(DEFAULT_MAX_CHARS);
  });
});

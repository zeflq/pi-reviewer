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

  it("skips whole sections when diff exceeds maxChars", () => {
    const sectionA = makeDiffSection("src/a.ts");
    const sectionB = makeDiffSection("src/b.ts");
    const maxChars = sectionA.length + 1; // fits A, not B
    const { diff, warning, skippedFiles } = filterDiff(sectionA + sectionB, maxChars);
    expect(diff).toContain("src/a.ts");
    expect(diff).not.toContain("src/b.ts");
    expect(skippedFiles).toEqual(["src/b.ts"]);
    expect(warning).toMatch(/1 file skipped/);
    expect(warning).toContain("src/b.ts");
  });

  it("never slices a section mid-way", () => {
    const section = makeDiffSection("src/index.ts");
    const maxChars = Math.floor(section.length / 2); // smaller than one section
    const { diff, skippedFiles } = filterDiff(section, maxChars);
    expect(diff).toBe("");
    expect(skippedFiles).toEqual(["src/index.ts"]);
  });

  it("combines noise exclusion and size-skip warnings", () => {
    const sectionA = makeDiffSection("src/index.ts");
    const raw = makeDiffSection("package-lock.json") + sectionA + makeDiffSection("src/big.ts");
    const maxChars = sectionA.length + 1;
    const { warning } = filterDiff(raw, maxChars);
    expect(warning).toMatch(/noise file/);
    expect(warning).toMatch(/skipped/);
  });

  it("uses DEFAULT_MAX_CHARS by default", () => {
    const small = makeDiffSection("src/index.ts");
    const { diff } = filterDiff(small);
    expect(diff.length).toBeLessThanOrEqual(DEFAULT_MAX_CHARS);
  });
});

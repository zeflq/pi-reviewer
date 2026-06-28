import { describe, expect, it } from "vitest";
import { countContextFiles, flattenContextFiles } from "../../ui/src/utils/context-panel-utils.js";
import type { ContextGroup } from "../../ui/src/types.js";

const groups: ContextGroup[] = [
  {
    name: "built-in",
    files: [
      { path: "AGENTS.md", content: "conventions" },
      { path: "REVIEW.md", content: "rules" },
    ],
  },
  {
    name: "pi-context",
    files: [{ path: "docs/arch.md", content: "arch docs" }],
  },
];

describe("countContextFiles", () => {
  it("returns 0 for empty groups", () => {
    expect(countContextFiles([])).toBe(0);
  });

  it("returns total file count across all groups", () => {
    expect(countContextFiles(groups)).toBe(3);
  });

  it("counts files in a single group", () => {
    expect(countContextFiles([{ name: "a", files: [{ path: "f", content: "c" }] }])).toBe(1);
  });

  it("handles groups with no files", () => {
    expect(countContextFiles([{ name: "empty", files: [] }])).toBe(0);
  });
});

describe("flattenContextFiles", () => {
  it("returns empty array for empty groups", () => {
    expect(flattenContextFiles([])).toEqual([]);
  });

  it("preserves group name on each file", () => {
    const flat = flattenContextFiles(groups);
    expect(flat[0].group).toBe("built-in");
    expect(flat[1].group).toBe("built-in");
    expect(flat[2].group).toBe("pi-context");
  });

  it("preserves path and content", () => {
    const flat = flattenContextFiles([{ name: "x", files: [{ path: "p", content: "c" }] }]);
    expect(flat[0]).toEqual({ path: "p", content: "c", group: "x" });
  });

  it("flattens all groups into one array", () => {
    expect(flattenContextFiles(groups)).toHaveLength(3);
  });

  it("returns files in group order", () => {
    const flat = flattenContextFiles(groups);
    expect(flat[0].path).toBe("AGENTS.md");
    expect(flat[1].path).toBe("REVIEW.md");
    expect(flat[2].path).toBe("docs/arch.md");
  });
});

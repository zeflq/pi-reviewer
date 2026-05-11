import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/core/ui-server.js", () => ({
  startUIServer: vi.fn(),
}));

import { startUIServer } from "../../../src/core/ui-server.js";
import { handleUIReview } from "../../../extensions/pi-reviewer/handlers/ui.js";
import type { ContextGroup } from "../../../src/core/context.js";

const baseResult = { summary: "LGTM", comments: [] };
const baseDiff = "diff --git a/foo.ts";

function makeHandle(actionOverrides: Record<string, unknown> = {}) {
  return {
    url: "http://localhost:12345",
    waitForAction: vi.fn().mockResolvedValue({
      type: "send",
      decisions: [],
      globalComment: "",
      selectedGroups: undefined,
      ...actionOverrides,
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeGroups(...names: string[]): ContextGroup[] {
  return names.map((name, i) => ({
    name,
    files: [{ path: `${name}/file${i}.md`, content: `content of ${name}` }],
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleUIReview — injection message context selection", () => {
  it("includes all groups when selectedGroups is undefined", async () => {
    const groups = makeGroups("built-in", "my-provider");
    vi.mocked(startUIServer).mockResolvedValue(makeHandle({ selectedGroups: undefined }) as any);

    const msg = await handleUIReview({ result: baseResult, diff: baseDiff, source: "HEAD vs main", cwd: "/p", notify: vi.fn(), contextGroups: groups });

    expect(msg).toContain("content of built-in");
    expect(msg).toContain("content of my-provider");
  });

  it("includes only selected groups", async () => {
    const groups = makeGroups("built-in", "my-provider");
    vi.mocked(startUIServer).mockResolvedValue(makeHandle({ selectedGroups: ["built-in"] }) as any);

    const msg = await handleUIReview({ result: baseResult, diff: baseDiff, source: "HEAD vs main", cwd: "/p", notify: vi.fn(), contextGroups: groups });

    expect(msg).toContain("content of built-in");
    expect(msg).not.toContain("content of my-provider");
  });

  it("omits context section when selectedGroups is empty", async () => {
    const groups = makeGroups("built-in", "my-provider");
    vi.mocked(startUIServer).mockResolvedValue(makeHandle({ selectedGroups: [] }) as any);

    const msg = await handleUIReview({ result: baseResult, diff: baseDiff, source: "HEAD vs main", cwd: "/p", notify: vi.fn(), contextGroups: groups });

    expect(msg).not.toContain("Project context");
  });

  it("includes all groups when selectedGroups names all of them", async () => {
    const groups = makeGroups("built-in", "provider-a", "provider-b");
    vi.mocked(startUIServer).mockResolvedValue(makeHandle({ selectedGroups: ["built-in", "provider-a", "provider-b"] }) as any);

    const msg = await handleUIReview({ result: baseResult, diff: baseDiff, source: "HEAD vs main", cwd: "/p", notify: vi.fn(), contextGroups: groups });

    expect(msg).toContain("content of built-in");
    expect(msg).toContain("content of provider-a");
    expect(msg).toContain("content of provider-b");
  });

  it("returns undefined for closed action", async () => {
    vi.mocked(startUIServer).mockResolvedValue(makeHandle({ type: "closed" }) as any);

    const msg = await handleUIReview({ result: baseResult, diff: baseDiff, source: "HEAD vs main", cwd: "/p", notify: vi.fn(), contextGroups: makeGroups("built-in") });

    expect(msg).toBeUndefined();
  });
});

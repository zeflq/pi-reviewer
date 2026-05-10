import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/core/context.js", async (importActual) => {
  const actual = await importActual<typeof import("../../../src/core/context.js")>();
  return { ...actual, collectProviderContext: vi.fn() };
});

import { collectProviderContext } from "../../../src/core/context.js";
import { buildContextGroups, BUILT_IN_GROUP } from "../../../extensions/pi-reviewer/handlers/context.js";

const stubEvents = { emit: vi.fn(), on: vi.fn().mockReturnValue(() => {}) };
const emptyContext = { conventions: [], reviewRules: [] };
const contextWithFiles = {
  conventions: [{ path: "AGENTS.md", content: "# Rules" }],
  reviewRules: [{ path: "REVIEW.md", content: "# Review" }],
};

beforeEach(() => {
  vi.mocked(collectProviderContext).mockResolvedValue([]);
});

describe("buildContextGroups", () => {
  it("returns empty groups when no built-in and no providers", async () => {
    const result = await buildContextGroups(stubEvents, "/project", emptyContext, []);
    expect(result.groups).toEqual([]);
    expect(result.contextFiles).toEqual([]);
    expect(result.contextPaths).toEqual([]);
  });

  it("includes built-in group when context has files", async () => {
    const result = await buildContextGroups(stubEvents, "/project", contextWithFiles, []);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].name).toBe(BUILT_IN_GROUP);
    expect(result.groups[0].files).toHaveLength(2);
    expect(result.contextFiles).toEqual([]);
    expect(result.contextPaths).toEqual(["AGENTS.md", "REVIEW.md"]);
  });

  it("includes provider group when providers return files", async () => {
    const providerFiles = [{ path: "docs/api.md", content: "API docs" }];
    vi.mocked(collectProviderContext).mockResolvedValue([{ name: "my-ext", files: providerFiles }]);

    const result = await buildContextGroups(stubEvents, "/project", emptyContext, ["src/foo.ts"]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].name).toBe("my-ext");
    expect(result.contextFiles).toEqual(providerFiles);
    expect(result.contextPaths).toEqual(["docs/api.md"]);
  });

  it("built-in group comes before provider groups", async () => {
    vi.mocked(collectProviderContext).mockResolvedValue([
      { name: "my-ext", files: [{ path: "docs/api.md", content: "" }] },
    ]);

    const result = await buildContextGroups(stubEvents, "/project", contextWithFiles, []);
    expect(result.groups[0].name).toBe(BUILT_IN_GROUP);
    expect(result.groups[1].name).toBe("my-ext");
  });

  it("contextPaths combines built-in and provider paths", async () => {
    vi.mocked(collectProviderContext).mockResolvedValue([
      { name: "my-ext", files: [{ path: "docs/api.md", content: "" }] },
    ]);

    const result = await buildContextGroups(stubEvents, "/project", contextWithFiles, []);
    expect(result.contextPaths).toEqual(["AGENTS.md", "REVIEW.md", "docs/api.md"]);
  });

  it("passes fs argument through to collectProviderContext", async () => {
    const fakeFs = { read: vi.fn(), list: vi.fn(), join: vi.fn(), dirname: vi.fn(), relative: vi.fn() } as any;
    await buildContextGroups(stubEvents, "/project", emptyContext, ["src/x.ts"], fakeFs);
    expect(collectProviderContext).toHaveBeenCalledWith(stubEvents, "/project", ["src/x.ts"], fakeFs, undefined);
  });
});

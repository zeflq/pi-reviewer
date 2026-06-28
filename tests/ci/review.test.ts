import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/diff-resolver.js", () => ({
  resolveDiff: vi.fn(),
  extractDiffFiles: vi.fn(() => []),
}));

vi.mock("../../src/core/doc-context.js", () => ({
  loadDocContext: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/core/context.js", () => ({
  loadContext: vi.fn(),
  mergeContextFiles: vi.fn((ctx) => [...(ctx.conventions ?? []), ...(ctx.reviewRules ?? [])]),
}));

vi.mock("../../src/core/output.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/output.js")>();
  return { ...actual, sendOutput: vi.fn() };
});

vi.mock("@mariozechner/pi-agent-core", () => ({
  Agent: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createReadOnlyTools: vi.fn().mockReturnValue([]),
}));

import { Agent } from "@mariozechner/pi-agent-core";
import { createReadOnlyTools } from "@mariozechner/pi-coding-agent";
import { loadContext } from "../../src/core/context.js";
import { resolveDiff } from "../../src/core/diff-resolver.js";
import { loadDocContext } from "../../src/core/doc-context.js";
import { sendOutput } from "../../src/core/output.js";
import { review, parseDocDirs } from "../../src/ci/review.js";

const resolveDiffMock = vi.mocked(resolveDiff);
const loadContextMock = vi.mocked(loadContext);
const loadDocContextMock = vi.mocked(loadDocContext);
const sendOutputMock = vi.mocked(sendOutput);
const AgentMock = vi.mocked(Agent);
const createReadOnlyToolsMock = vi.mocked(createReadOnlyTools);

function makeFakeAgent(text = "LGTM") {
  return {
    subscribe: vi.fn((cb: (event: unknown) => void) => {
      cb({
        type: "agent_end",
        messages: [{ role: "assistant", content: [{ type: "text", text }] }],
      });
      return vi.fn();
    }),
    prompt: vi.fn().mockResolvedValue(undefined),
  };
}

describe("review", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    resolveDiffMock.mockResolvedValue({
      diff: "diff --git a/a.ts b/a.ts",
      source: "git diff origin/main...HEAD",
    });
    loadContextMock.mockResolvedValue({ conventions: [{ path: "AGENTS.md", content: "- Use strict typing" }], reviewRules: [] });
    sendOutputMock.mockResolvedValue(undefined);
    createReadOnlyToolsMock.mockReturnValue([]);
    AgentMock.mockImplementation(function () {
      return makeFakeAgent() as any;
    });

    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.PI_API_KEY;
    delete process.env.PI_REVIEWER_DOC_DIRS;
    // model is mandatory — provide a default for tests that don't exercise it
    process.env.PI_REVIEWER_MODEL = "anthropic/claude-opus-4-6";
  });

  it("dry-run logs source and prompt, without calling agent or output", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await review({ cwd: "/repo", dryRun: true });

    expect(logSpy).toHaveBeenCalledWith("Diff source: git diff origin/main...HEAD");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("System prompt:\n\nYou are a code reviewer")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("User prompt:\n\nReview this diff:\n<diff>\ndiff --git a/a.ts b/a.ts")
    );
    expect(AgentMock).not.toHaveBeenCalled();
    expect(sendOutputMock).not.toHaveBeenCalled();
  });

  it("uses terminal output target in local mode", async () => {
    await review({ cwd: "/repo" });

    expect(createReadOnlyToolsMock).toHaveBeenCalledWith("/repo");
    expect(AgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialState: expect.objectContaining({
          tools: [],
          thinkingLevel: "off",
        }),
      })
    );
    expect(sendOutputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "terminal",
        content: "LGTM",
        cwd: "/repo",
      })
    );
  });

  it("uses comment output target in CI mode", async () => {
    process.env.GITHUB_ACTIONS = "true";

    await review({ cwd: "/repo", pr: 42, githubToken: "token", repo: "owner/repo" });

    expect(sendOutputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "comment",
        prNumber: 42,
        githubToken: "token",
        repo: "owner/repo",
      })
    );
  });

  it("allows explicit output option to override auto-detect", async () => {
    process.env.GITHUB_ACTIONS = "true";

    await review({ cwd: "/repo", output: "file" });

    expect(sendOutputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "file",
      })
    );
  });

  it("continues normally when AGENTS.md context is missing", async () => {
    loadContextMock.mockResolvedValue({ conventions: [], reviewRules: [] });

    await review({ cwd: "/repo" });

    expect(AgentMock).toHaveBeenCalled();
    expect(sendOutputMock).toHaveBeenCalled();
  });

  it("does not scan doc dirs when none are configured (opt-in)", async () => {
    await review({ cwd: "/repo" });

    expect(loadDocContextMock).not.toHaveBeenCalled();
  });

  it("scans configured doc dirs and injects matching docs into the system prompt", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    loadDocContextMock.mockResolvedValueOnce([{ path: ".pi/notes/auth.md", content: "auth doc body" }]);

    await review({ cwd: "/repo", dryRun: true, docDirs: [".pi/notes"] });

    expect(loadDocContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo", docDirs: [".pi/notes"] })
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("System prompt:")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("auth doc body")
    );
  });

  it("reads doc dirs from PI_REVIEWER_DOC_DIRS env when option absent", async () => {
    process.env.PI_REVIEWER_DOC_DIRS = ".pi/notes, docs/review";

    await review({ cwd: "/repo" });

    expect(loadDocContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ docDirs: [".pi/notes", "docs/review"] })
    );
  });

  it("parseDocDirs splits on commas and newlines, trims, drops empties", () => {
    expect(parseDocDirs(undefined)).toEqual([]);
    expect(parseDocDirs("")).toEqual([]);
    expect(parseDocDirs(".pi/notes, docs/review")).toEqual([".pi/notes", "docs/review"]);
    expect(parseDocDirs(".pi/notes\n\ndocs/review,")).toEqual([".pi/notes", "docs/review"]);
  });

  it("resolves a provider/modelId with slashes (OpenRouter) for the agent", async () => {
    await review({ cwd: "/repo", model: "openrouter/openai/gpt-5.4-mini" });

    expect(AgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialState: expect.objectContaining({
          model: expect.objectContaining({ provider: "openrouter", id: "openai/gpt-5.4-mini" }),
        }),
      })
    );
  });

  it("throws on an invalid model format", async () => {
    await expect(review({ cwd: "/repo", model: "gpt-5" })).rejects.toThrow(/Invalid model format/);
  });

  it("throws when no model is configured", async () => {
    delete process.env.PI_REVIEWER_MODEL;
    await expect(review({ cwd: "/repo" })).rejects.toThrow(/No model configured/);
  });

  it("passes final agent response to sendOutput", async () => {
    AgentMock.mockImplementation(function () {
      return makeFakeAgent("Please fix null checks in src/a.ts") as any;
    });

    await review({ cwd: "/repo" });

    expect(sendOutputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Please fix null checks in src/a.ts",
      })
    );
  });
});

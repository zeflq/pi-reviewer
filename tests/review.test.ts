import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/diff-resolver.js", () => ({
  resolveDiff: vi.fn(),
}));

vi.mock("../src/context.js", () => ({
  loadContext: vi.fn(),
}));

vi.mock("../src/output.js", () => ({
  sendOutput: vi.fn(),
}));

vi.mock("@mariozechner/pi-agent-core", () => ({
  Agent: vi.fn(),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  createReadOnlyTools: vi.fn().mockReturnValue([]),
}));

import { Agent } from "@mariozechner/pi-agent-core";
import { createReadOnlyTools } from "@mariozechner/pi-coding-agent";
import { loadContext } from "../src/context.js";
import { resolveDiff } from "../src/diff-resolver.js";
import { sendOutput } from "../src/output.js";
import { review } from "../src/review.js";

const resolveDiffMock = vi.mocked(resolveDiff);
const loadContextMock = vi.mocked(loadContext);
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
    loadContextMock.mockResolvedValue({ conventions: "- Use strict typing", reviewRules: "" });
    sendOutputMock.mockResolvedValue(undefined);
    createReadOnlyToolsMock.mockReturnValue([]);
    AgentMock.mockImplementation(function () {
      return makeFakeAgent() as any;
    });

    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("dry-run logs source and prompt, without calling agent or output", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await review({ cwd: "/repo", dryRun: true });

    expect(logSpy).toHaveBeenCalledWith("Diff source: git diff origin/main...HEAD");
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("System prompt:\n\nYou are a code reviewer")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("User prompt:\n\nReview this diff:\n\ndiff --git a/a.ts b/a.ts")
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
    loadContextMock.mockResolvedValue({ conventions: "", reviewRules: "" });

    await review({ cwd: "/repo" });

    expect(AgentMock).toHaveBeenCalled();
    expect(sendOutputMock).toHaveBeenCalled();
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

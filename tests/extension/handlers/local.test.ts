import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock("node:fs/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn().mockResolvedValue(undefined), unlink: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../../../src/core/diff-resolver.js", async (importActual) => {
  const actual = await importActual<typeof import("../../../src/core/diff-resolver.js")>();
  return { ...actual, resolveDiff: vi.fn() };
});

vi.mock("../../../src/core/context.js", async (importActual) => {
  const actual = await importActual<typeof import("../../../src/core/context.js")>();
  return { ...actual, loadContext: vi.fn() };
});

vi.mock("../../../src/core/ui/server/index.js", () => ({
  readDefaultBranch: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../../extensions/pi-reviewer/footer.js", () => ({
  setReviewFooter: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("../../../extensions/pi-reviewer/handlers/ui.js", () => ({
  handleUIReview: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../extensions/pi-reviewer/handlers/context.js", () => ({
  buildContextGroups: vi.fn().mockResolvedValue({ groups: [], contextFiles: [], contextPaths: [] }),
  BUILT_IN_GROUP: "built-in",
}));

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolveDiff } from "../../../src/core/diff-resolver.js";
import { loadContext } from "../../../src/core/context.js";
import { setReviewFooter } from "../../../extensions/pi-reviewer/footer.js";
import { handleUIReview } from "../../../extensions/pi-reviewer/handlers/ui.js";
import { buildContextGroups } from "../../../extensions/pi-reviewer/handlers/context.js";
import { handleLocalReview } from "../../../extensions/pi-reviewer/handlers/local.js";
import type { ReviewCommandArgs } from "../../../extensions/pi-reviewer/args.js";

// Emits a turn_end event with a valid ReviewResult JSON so runLocalReview resolves.
function makeFakeProcess(reviewJson = '{"summary":"LGTM","comments":[]}') {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  }) as any;
  setImmediate(() => {
    const line = JSON.stringify({
      type: "turn_end",
      message: { role: "assistant", content: reviewJson },
    });
    proc.stdout.emit("data", Buffer.from(line + "\n"));
    proc.emit("close", 0, null);
  });
  return proc;
}

function createStubEventBus() {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    emit(channel: string, data: unknown) { for (const h of handlers.get(channel) ?? []) h(data); },
    on(channel: string, handler: (data: unknown) => void) {
      if (!handlers.has(channel)) handlers.set(channel, []);
      handlers.get(channel)!.push(handler);
      return () => {};
    },
  };
}

const baseParsed: ReviewCommandArgs = {
  diff: undefined, branch: undefined, pr: undefined, dir: undefined,
  dryRun: false, ssh: false, ui: false,
  verbose: undefined, minSeverity: undefined, model: undefined, thinking: undefined,
};

const ctx = { cwd: "/project", ui: { setFooter: vi.fn(), notify: vi.fn() } } as any;

function makeOpts(parsedOverrides: Partial<ReviewCommandArgs> = {}) {
  const loaderState = { stop: vi.fn() };
  return {
    parsed: { ...baseParsed, ...parsedOverrides },
    ctx,
    pi: { events: createStubEventBus(), on: vi.fn(), sendUserMessage: vi.fn() } as any,
    loaderState,
    notify: vi.fn(),
    minSeverity: "INFO" as const,
    verbose: undefined, model: undefined, thinking: undefined,
    currentModelId: undefined, defaultModel: undefined,
    availableModels: [], defaultThinking: undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveDiff).mockResolvedValue({ diff: "diff --git a/foo.ts\n", source: "feature vs main" });
  vi.mocked(loadContext).mockResolvedValue({ conventions: [], reviewRules: [] });
  vi.mocked(spawn).mockReturnValue(makeFakeProcess() as any);
  vi.mocked(buildContextGroups).mockResolvedValue({ groups: [], contextFiles: [], contextPaths: [] });
  vi.mocked(handleUIReview).mockResolvedValue(undefined);
  vi.mocked(setReviewFooter).mockReturnValue(vi.fn());
});

describe("handleLocalReview — non-UI path", () => {
  it("sends progress notifications in order", async () => {
    const opts = makeOpts();
    await handleLocalReview(opts);
    const messages = opts.notify.mock.calls.map(c => c[0]);
    expect(messages.indexOf("Fetching diff…")).toBeLessThan(messages.indexOf("Loading context…"));
  });

  it("calls setReviewFooter with resolved source", async () => {
    const opts = makeOpts();
    await handleLocalReview(opts);
    expect(setReviewFooter).toHaveBeenCalledWith(ctx, "feature vs main", expect.any(Object));
  });

  it("spawns pi with --append-system-prompt flag", async () => {
    const opts = makeOpts();
    await handleLocalReview(opts);
    expect(spawn).toHaveBeenCalledWith("pi", expect.arrayContaining(["--append-system-prompt"]), expect.any(Object));
  });

  it("writes pi-review.md to ctx.cwd", async () => {
    const opts = makeOpts();
    await handleLocalReview(opts);
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("pi-review.md"),
      expect.stringContaining("# Pi Review — feature vs main"),
      "utf-8",
    );
  });

  it("notifies review saved", async () => {
    const opts = makeOpts();
    await handleLocalReview(opts);
    expect(opts.notify).toHaveBeenCalledWith("Review saved → pi-review.md");
  });
});

describe("handleLocalReview — --ui path", () => {
  it("calls handleUIReview with result, diff, and source", async () => {
    const opts = makeOpts({ ui: true });
    await handleLocalReview(opts);
    expect(handleUIReview).toHaveBeenCalledWith(expect.objectContaining({
      diff: "diff --git a/foo.ts\n",
      source: "feature vs main",
    }));
  });

  it("sends injection message via pi.sendUserMessage", async () => {
    vi.mocked(handleUIReview).mockResolvedValueOnce("fix: address all comments");
    const opts = makeOpts({ ui: true });
    await handleLocalReview(opts);
    expect(opts.pi.sendUserMessage).toHaveBeenCalledWith("fix: address all comments");
  });

  it("does not write pi-review.md", async () => {
    const opts = makeOpts({ ui: true });
    await handleLocalReview(opts);
    const reviewSave = vi.mocked(writeFile).mock.calls.find(c => String(c[0]).endsWith("pi-review.md"));
    expect(reviewSave).toBeUndefined();
  });
});

describe("handleLocalReview — diff warning", () => {
  it("notifies warning when resolveDiff returns one", async () => {
    vi.mocked(resolveDiff).mockResolvedValue({
      diff: "diff --git a/foo.ts\n",
      source: "feature vs main",
      warning: "Diff truncated to 100k chars",
    });
    const opts = makeOpts();
    await handleLocalReview(opts);
    expect(opts.notify).toHaveBeenCalledWith("Diff truncated to 100k chars", "warning");
  });
});

describe("handleLocalReview — context paths notify", () => {
  it("notifies context paths when files are present", async () => {
    vi.mocked(buildContextGroups).mockResolvedValue({
      groups: [],
      contextFiles: [],
      contextPaths: ["AGENTS.md", "docs/api.md"],
    });
    const opts = makeOpts();
    await handleLocalReview(opts);
    expect(opts.notify).toHaveBeenCalledWith("Context: AGENTS.md, docs/api.md");
  });

  it("does not send context notify when no files", async () => {
    const opts = makeOpts();
    await handleLocalReview(opts);
    const contextCall = opts.notify.mock.calls.find(c => String(c[0]).startsWith("Context:"));
    expect(contextCall).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/core/diff-resolver.js", async (importActual) => {
  const actual = await importActual<typeof import("../../../src/core/diff-resolver.js")>();
  return { ...actual, resolveDiff: vi.fn() };
});

vi.mock("../../../src/core/context.js", async (importActual) => {
  const actual = await importActual<typeof import("../../../src/core/context.js")>();
  return { ...actual, loadContext: vi.fn(), collectProviderContext: vi.fn() };
});

vi.mock("../../../src/core/ui/server/index.js", () => ({
  readDefaultBranch: vi.fn().mockReturnValue(undefined),
}));

import { resolveDiff } from "../../../src/core/diff-resolver.js";
import { loadContext, collectProviderContext } from "../../../src/core/context.js";
import { handleDryRun } from "../../../extensions/pi-reviewer/handlers/dry-run.js";
import type { ReviewCommandArgs } from "../../../extensions/pi-reviewer/args.js";

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

function makeOpts(parsedOverrides: Partial<ReviewCommandArgs> = {}) {
  const notify = vi.fn();
  const pi = { events: createStubEventBus(), on: vi.fn(), sendUserMessage: vi.fn() } as any;
  const parsed: ReviewCommandArgs = {
    diff: undefined, branch: undefined, pr: undefined, dir: undefined,
    dryRun: true, ssh: false, ui: false,
    verbose: undefined, minSeverity: undefined, model: undefined, thinking: undefined,
    ...parsedOverrides,
  };
  return {
    parsed, cwd: "/project", pi, notify,
    loaderState: { stop: vi.fn() },
    minSeverity: "INFO" as const,
    verbose: undefined, model: undefined, thinking: undefined,
    currentModelId: undefined, defaultModel: undefined,
    availableModels: [], defaultThinking: undefined,
  };
}

beforeEach(() => {
  vi.mocked(resolveDiff).mockResolvedValue({ diff: "diff --git a/foo.ts\n", source: "feature vs main" });
  vi.mocked(loadContext).mockResolvedValue({ conventions: [], reviewRules: [] });
  vi.mocked(collectProviderContext).mockResolvedValue([]);
});

describe("handleDryRun — SSH path", () => {
  it("notifies system prompt with markdown format", async () => {
    const opts = makeOpts({ ssh: true });
    await handleDryRun(opts);
    const systemPromptCall = opts.notify.mock.calls.find(args => String(args[0]).includes("System prompt:"));
    expect(systemPromptCall).toBeDefined();
  });

  it("notifies user prompt with SSH diff command", async () => {
    const opts = makeOpts({ ssh: true });
    await handleDryRun(opts);
    const userPromptCall = opts.notify.mock.calls.find(args => String(args[0]).includes("User prompt:"));
    expect(userPromptCall).toBeDefined();
  });

  it("does not call resolveDiff or loadContext", async () => {
    const opts = makeOpts({ ssh: true });
    await handleDryRun(opts);
    expect(resolveDiff).not.toHaveBeenCalled();
    expect(loadContext).not.toHaveBeenCalled();
  });
});

describe("handleDryRun — local path", () => {
  it("calls resolveDiff with parsed options", async () => {
    const opts = makeOpts({ branch: "dev" });
    await handleDryRun(opts);
    expect(resolveDiff).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/project", branch: "dev" }));
  });

  it("notifies diff source", async () => {
    const opts = makeOpts();
    await handleDryRun(opts);
    const sourceCall = opts.notify.mock.calls.find(args => String(args[0]).startsWith("Diff source:"));
    expect(sourceCall).toBeDefined();
    expect(sourceCall![0]).toContain("feature vs main");
  });

  it("notifies system prompt in JSON format", async () => {
    const opts = makeOpts();
    await handleDryRun(opts);
    const call = opts.notify.mock.calls.find(args => String(args[0]).includes("System prompt:"));
    expect(call).toBeDefined();
  });

  it("notifies user prompt", async () => {
    const opts = makeOpts();
    await handleDryRun(opts);
    const call = opts.notify.mock.calls.find(args => String(args[0]).includes("User prompt:"));
    expect(call).toBeDefined();
  });

  it("provider context files appear in system prompt", async () => {
    vi.mocked(collectProviderContext).mockResolvedValue([
      { name: "my-ext", files: [{ path: "docs/api.md", content: "PROVIDER CONTENT" }] },
    ]);
    const opts = makeOpts();
    await handleDryRun(opts);
    const call = opts.notify.mock.calls.find(args => String(args[0]).includes("System prompt:"));
    expect(call![0]).toContain("PROVIDER CONTENT");
  });
});

import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/core/diff-resolver.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/diff-resolver.js")>();
  return { ...actual, resolveDiff: vi.fn() };
});

vi.mock("../../src/core/context.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/context.js")>();
  return { ...actual, loadContext: vi.fn() };
});

vi.mock("../../src/core/ui/server/index.js", () => ({
  readMinSeverity: vi.fn().mockReturnValue("INFO"),
  readVerbose: vi.fn().mockReturnValue(false),
  readModel: vi.fn().mockReturnValue(undefined),
  readThinking: vi.fn().mockReturnValue(undefined),
  readDefaultBranch: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../src/core/ssh.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/ssh.js")>();
  return { ...actual, readSshFlag: vi.fn().mockReturnValue(undefined) };
});

vi.mock("node:child_process", async (importActual) => {
  const actual = await importActual<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock("node:fs/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn().mockResolvedValue(undefined), unlink: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("../../extensions/pi-reviewer/footer.js", () => ({
  setReviewFooter: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("../../extensions/pi-reviewer/handlers/ui.js", () => ({
  handleUIReview: vi.fn().mockResolvedValue(undefined),
}));

import { spawn } from "node:child_process";
import { resolveDiff } from "../../src/core/diff-resolver.js";
import { loadContext, CONTEXT_PROVIDER_EVENT } from "../../src/core/context.js";
import type { ContextProviderEvent } from "../../src/core/context.js";
import { readSshFlag } from "../../src/core/ssh.js";
import { setReviewFooter } from "../../extensions/pi-reviewer/footer.js";
import registerExtension from "../../extensions/pi-reviewer/index.js";

// Emits a turn_end event so runLocalReview resolves successfully
function makeFakeProcess(reviewJson = '{"summary":"LGTM","comments":[]}') {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  }) as any;
  setImmediate(() => {
    const line = JSON.stringify({ type: "turn_end", message: { role: "assistant", content: reviewJson } });
    proc.stdout.emit("data", Buffer.from(line + "\n"));
    proc.emit("close", 0, null);
  });
  return proc;
}

function createStubEventBus() {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    emit(channel: string, data: unknown) {
      for (const h of handlers.get(channel) ?? []) h(data);
    },
    on(channel: string, handler: (data: unknown) => void) {
      if (!handlers.has(channel)) handlers.set(channel, []);
      handlers.get(channel)!.push(handler);
      return () => {};
    },
  };
}

describe("context provider integration", () => {
  let events: ReturnType<typeof createStubEventBus>;
  let notifySpy: ReturnType<typeof vi.fn>;
  let capturedHandler: ((args: string, ctx: unknown) => Promise<void>) | undefined;

  beforeEach(() => {
    vi.mocked(resolveDiff).mockResolvedValue({
      diff: "diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new\n",
      source: "feature vs origin/main",
    });
    vi.mocked(loadContext).mockResolvedValue({ conventions: [], reviewRules: [] });

    events = createStubEventBus();
    notifySpy = vi.fn();
    capturedHandler = undefined;

    const pi = {
      events,
      registerCommand: vi.fn((_name: string, { handler }: { handler: typeof capturedHandler }) => {
        capturedHandler = handler;
      }),
      on: vi.fn(),
    };

    registerExtension(pi as any);
  });

  it("provider content reaches the system prompt on --dry-run", async () => {
    events.on(CONTEXT_PROVIDER_EVENT, (data) => {
      const { register } = data as ContextProviderEvent;
      register("test-ext", async () => [{ path: "docs/arch.md", content: "TEST EXTRA" }]);
    });

    await capturedHandler!("--dry-run", {
      cwd: "/project",
      ui: { notify: notifySpy },
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
    });

    const systemPromptNotify = notifySpy.mock.calls.find((args) =>
      typeof args[0] === "string" && args[0].includes("System prompt:")
    );
    expect(systemPromptNotify).toBeDefined();
    expect(systemPromptNotify![0]).toContain("TEST EXTRA");
  });

  it("provider is called with cwd and diffFiles", async () => {
    const provider = vi.fn().mockResolvedValue([]);
    events.on(CONTEXT_PROVIDER_EVENT, (data) => {
      const { register } = data as ContextProviderEvent;
      register("test-ext", provider);
    });

    await capturedHandler!("--dry-run", {
      cwd: "/project",
      ui: { notify: notifySpy },
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
    });

    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "/project",
      diffFiles: ["src/foo.ts"],
    }));
  });

  it("no providers registered — system prompt is unchanged", async () => {
    vi.mocked(loadContext).mockResolvedValue({
      conventions: [{ path: "AGENTS.md", content: "use strict typing" }],
      reviewRules: [],
    });

    await capturedHandler!("--dry-run", {
      cwd: "/project",
      ui: { notify: notifySpy },
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
    });

    const systemPromptNotify = notifySpy.mock.calls.find((args) =>
      typeof args[0] === "string" && args[0].includes("System prompt:")
    );
    expect(systemPromptNotify![0]).toContain("use strict typing");
    expect(systemPromptNotify![0]).not.toContain("TEST EXTRA");
  });
});

describe("command routing", () => {
  let capturedHandler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
  let notifySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveDiff).mockResolvedValue({ diff: "diff --git a/foo.ts\n", source: "feature vs main" });
    vi.mocked(loadContext).mockResolvedValue({ conventions: [], reviewRules: [] });
    vi.mocked(spawn).mockReturnValue(makeFakeProcess() as any);
    vi.mocked(setReviewFooter).mockReturnValue(vi.fn());

    notifySpy = vi.fn();
    capturedHandler = undefined;

    const pi = {
      events: createStubEventBus(),
      registerCommand: vi.fn((_name: string, { handler }: { handler: typeof capturedHandler }) => {
        capturedHandler = handler;
      }),
      on: vi.fn(),
      sendUserMessage: vi.fn(),
    };
    registerExtension(pi as any);
  });

  it("local path: calls resolveDiff (not SSH)", async () => {
    await capturedHandler!("", {
      cwd: "/project",
      ui: { notify: notifySpy },
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
    });
    expect(resolveDiff).toHaveBeenCalled();
    expect(readSshFlag).not.toHaveBeenCalled();
  });

  it("--ssh flag: calls readSshFlag (not resolveDiff)", async () => {
    await capturedHandler!("--ssh", {
      cwd: "/project",
      ui: { notify: notifySpy },
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
    });
    expect(readSshFlag).toHaveBeenCalled();
    expect(resolveDiff).not.toHaveBeenCalled();
  });
});

describe("error handling", () => {
  let capturedHandler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
  let notifySpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadContext).mockResolvedValue({ conventions: [], reviewRules: [] });
    vi.mocked(setReviewFooter).mockReturnValue(vi.fn());

    notifySpy = vi.fn();
    capturedHandler = undefined;

    const pi = {
      events: createStubEventBus(),
      registerCommand: vi.fn((_name: string, { handler }: { handler: typeof capturedHandler }) => {
        capturedHandler = handler;
      }),
      on: vi.fn(),
      sendUserMessage: vi.fn(),
    };
    registerExtension(pi as any);
  });

  it("appends SSH hint when error is 'not a git repository' in local mode", async () => {
    vi.mocked(resolveDiff).mockRejectedValue(new Error("not a git repository"));
    await capturedHandler!("", {
      cwd: "/project",
      ui: { notify: notifySpy },
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
    });
    const errorCall = notifySpy.mock.calls.find(c => String(c[0]).startsWith("Review failed:"));
    expect(errorCall![0]).toContain("try adding --ssh");
    expect(errorCall![1]).toBe("error");
  });

  it("no SSH hint when error is unrelated", async () => {
    vi.mocked(resolveDiff).mockRejectedValue(new Error("network timeout"));
    await capturedHandler!("", {
      cwd: "/project",
      ui: { notify: notifySpy },
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
    });
    const errorCall = notifySpy.mock.calls.find(c => String(c[0]).startsWith("Review failed:"));
    expect(errorCall![0]).not.toContain("try adding --ssh");
  });

  it("loaderState.stop is called on error after loader was set", async () => {
    const stopFn = vi.fn();
    vi.mocked(setReviewFooter).mockReturnValue(stopFn);
    // resolveDiff resolves so we get past the loader setup, then spawn fails
    vi.mocked(resolveDiff).mockResolvedValue({ diff: "diff --git\n", source: "x" });
    vi.mocked(spawn).mockReturnValue((() => {
      const proc = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() }) as any;
      setImmediate(() => proc.emit("close", 1, null));
      return proc;
    })() as any);

    await capturedHandler!("", {
      cwd: "/project",
      ui: { notify: notifySpy },
      model: undefined,
      modelRegistry: { getAvailable: () => [] },
    });
    expect(stopFn).toHaveBeenCalled();
  });
});

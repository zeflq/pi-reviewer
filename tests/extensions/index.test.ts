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

import { resolveDiff } from "../../src/core/diff-resolver.js";
import { loadContext, CONTEXT_PROVIDER_EVENT } from "../../src/core/context.js";
import type { ContextProviderEvent } from "../../src/core/context.js";
import registerExtension from "../../extensions/pi-reviewer/index.js";

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

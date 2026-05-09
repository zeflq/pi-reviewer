import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/core/ssh.js", async (importActual) => {
  const actual = await importActual<typeof import("../../../src/core/ssh.js")>();
  return { ...actual, readSshFlag: vi.fn().mockReturnValue(undefined) };
});

vi.mock("../../../src/core/context.js", async (importActual) => {
  const actual = await importActual<typeof import("../../../src/core/context.js")>();
  return { ...actual, collectProviderContext: vi.fn().mockResolvedValue([]) };
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

import { setReviewFooter } from "../../../extensions/pi-reviewer/footer.js";
import { handleUIReview } from "../../../extensions/pi-reviewer/handlers/ui.js";
import { handleSSHReview } from "../../../extensions/pi-reviewer/handlers/ssh.js";
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

const baseParsed: ReviewCommandArgs = {
  diff: undefined, branch: undefined, pr: undefined, dir: undefined,
  dryRun: false, ssh: true, ui: false,
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

const fakeAssistantMessage = {
  role: "assistant",
  content: '{"summary":"LGTM","comments":[]}',
};

// pi stub that fires agent_end synchronously when registered — makes runSSHReviewAndWait resolve immediately
function makeSyncAgentEndPi() {
  const eventBus = createStubEventBus();
  return {
    events: eventBus,
    sendUserMessage: vi.fn(),
    on: vi.fn((event: string, handler: (data: unknown) => void) => {
      if (event === "agent_end") {
        handler({ messages: [fakeAssistantMessage] });
      }
    }),
  } as any;
}

beforeEach(() => {
  vi.mocked(setReviewFooter).mockReturnValue(vi.fn());
  vi.mocked(handleUIReview).mockResolvedValue(undefined);
});

describe("handleSSHReview — non-UI path (sshState = null)", () => {
  it("calls pi.sendUserMessage with the user prompt", async () => {
    const opts = makeOpts();
    await handleSSHReview(opts);
    expect(opts.pi.sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it("registers before_agent_start and agent_end hooks", async () => {
    const opts = makeOpts();
    await handleSSHReview(opts);
    const events = vi.mocked(opts.pi.on).mock.calls.map(c => c[0]);
    expect(events).toContain("before_agent_start");
    expect(events).toContain("agent_end");
  });

  it("sets loaderState.stop via setReviewFooter", async () => {
    const stopFn = vi.fn();
    vi.mocked(setReviewFooter).mockReturnValue(stopFn);
    const opts = makeOpts();
    await handleSSHReview(opts);
    expect(opts.loaderState.stop).toBe(stopFn);
  });

  it("calls setReviewFooter with the resolved source", async () => {
    const opts = makeOpts();
    await handleSSHReview(opts);
    expect(setReviewFooter).toHaveBeenCalledWith(ctx, expect.any(String), expect.any(Object));
  });
});

describe("handleSSHReview — UI path (sshState = null)", () => {
  it("calls handleUIReview after agent completes", async () => {
    const opts = makeOpts({ ui: true });
    opts.pi = makeSyncAgentEndPi();
    await handleSSHReview(opts);
    expect(handleUIReview).toHaveBeenCalledWith(expect.objectContaining({ ssh: true }));
  });

  it("sends injection message via pi.sendUserMessage", async () => {
    vi.mocked(handleUIReview).mockResolvedValueOnce("address all comments");
    const opts = makeOpts({ ui: true });
    opts.pi = makeSyncAgentEndPi();
    await handleSSHReview(opts);
    expect(opts.pi.sendUserMessage).toHaveBeenCalledWith("address all comments");
  });
});

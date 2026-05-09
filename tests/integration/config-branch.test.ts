/**
 * Integration tests: `branch` key in config.json flows through to resolveDiff.
 * node:fs.readFileSync is wrapped so the real config module parses our test JSON
 * without touching the user's actual ~/.pi/pi-reviewer/config.json.
 */

vi.mock("node:fs", async (importActual) => {
  const actual = await importActual<typeof import("node:fs")>();
  // Default: delegate to real readFileSync; individual tests override via mockReturnValueOnce
  return { ...actual, readFileSync: vi.fn().mockImplementation(actual.readFileSync) };
});

vi.mock("../../src/core/diff-resolver.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/diff-resolver.js")>();
  return { ...actual, resolveDiff: vi.fn() };
});

vi.mock("../../src/core/context.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/context.js")>();
  return {
    ...actual,
    loadContext: vi.fn().mockResolvedValue({ conventions: [], reviewRules: [] }),
    collectProviderContext: vi.fn().mockResolvedValue([]),
  };
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readConfig, readDefaultBranch } from "../../src/core/config.js";
import { resolveDiff } from "../../src/core/diff-resolver.js";
import { handleDryRun } from "../../extensions/pi-reviewer/handlers/dry-run.js";
import type { ReviewCommandArgs } from "../../extensions/pi-reviewer/args.js";

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
  vi.mocked(readFileSync).mockClear();
  vi.mocked(resolveDiff).mockResolvedValue({ diff: "diff --git a/foo.ts\n", source: "feat vs main" });
});

/** Makes the next readFileSync call return the given config JSON. */
function mockConfigFile(config: Record<string, unknown>) {
  vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(config));
}

describe("readConfig / readDefaultBranch", () => {
  it("reads branch from config.json", () => {
    mockConfigFile({ branch: "develop" });
    expect(readConfig().branch).toBe("develop");
  });

  it("readDefaultBranch returns the configured branch", () => {
    mockConfigFile({ branch: "develop" });
    expect(readDefaultBranch()).toBe("develop");
  });

  it("readDefaultBranch returns undefined when branch is not set", () => {
    mockConfigFile({});
    expect(readDefaultBranch()).toBeUndefined();
  });
});

describe("config branch flows through to resolveDiff", () => {
  it("passes config branch to resolveDiff when no --branch flag is given", async () => {
    mockConfigFile({ branch: "develop" });
    const opts = makeOpts();
    await handleDryRun(opts);
    expect(resolveDiff).toHaveBeenCalledWith(expect.objectContaining({ branch: "develop" }));
  });

  it("--branch flag overrides config branch", async () => {
    mockConfigFile({ branch: "develop" });
    const opts = makeOpts({ branch: "feature/override" });
    await handleDryRun(opts);
    expect(resolveDiff).toHaveBeenCalledWith(expect.objectContaining({ branch: "feature/override" }));
  });
});

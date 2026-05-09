/**
 * Integration tests: real file system reads flow through handleDryRun into the system prompt.
 * loadContext is NOT mocked — actual file I/O happens against temp directories.
 * Only resolveDiff and collectProviderContext are mocked.
 */

vi.mock("../../src/core/diff-resolver.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/diff-resolver.js")>();
  return { ...actual, resolveDiff: vi.fn() };
});

vi.mock("../../src/core/context.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/core/context.js")>();
  // loadContext stays real; only collectProviderContext is stubbed
  return { ...actual, collectProviderContext: vi.fn().mockResolvedValue([]) };
});

vi.mock("../../src/core/ui/server/index.js", () => ({
  readDefaultBranch: vi.fn().mockReturnValue(undefined),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDiff } from "../../src/core/diff-resolver.js";
import { handleDryRun } from "../../extensions/pi-reviewer/handlers/dry-run.js";
import { createTempProject } from "../fixtures/factory.js";
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

function makeOpts(cwd: string, parsedOverrides: Partial<ReviewCommandArgs> = {}) {
  const notify = vi.fn();
  const pi = { events: createStubEventBus(), on: vi.fn(), sendUserMessage: vi.fn() } as any;
  const parsed: ReviewCommandArgs = {
    diff: undefined, branch: undefined, pr: undefined, dir: undefined,
    dryRun: true, ssh: false, ui: false,
    verbose: undefined, minSeverity: undefined, model: undefined, thinking: undefined,
    ...parsedOverrides,
  };
  return {
    parsed, cwd, pi, notify,
    loaderState: { stop: vi.fn() },
    minSeverity: "INFO" as const,
    verbose: undefined, model: undefined, thinking: undefined,
    currentModelId: undefined, defaultModel: undefined,
    availableModels: [], defaultThinking: undefined,
  };
}

beforeEach(() => {
  vi.mocked(resolveDiff).mockResolvedValue({
    diff: "diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-old\n+new\n",
    source: "feat vs main",
  });
});

describe("context loading — .pi/ subdir", () => {
  it("AGENTS.md and REVIEW.md in .pi/ appear in system prompt", async () => {
    const { dir, cleanup } = await createTempProject({
      ".pi/AGENTS.md": "# Pi Subdir Conventions",
      ".pi/REVIEW.md": "# Pi Subdir Review Rules",
    });
    try {
      const opts = makeOpts(dir);
      await handleDryRun(opts);
      const call = opts.notify.mock.calls.find(c => String(c[0]).includes("System prompt:"));
      expect(call).toBeDefined();
      expect(call![0]).toContain("# Pi Subdir Conventions");
      expect(call![0]).toContain("# Pi Subdir Review Rules");
    } finally { await cleanup(); }
  });
});

describe("context loading — root level", () => {
  it("root AGENTS.md and REVIEW.md appear in system prompt", async () => {
    const { dir, cleanup } = await createTempProject({
      "AGENTS.md": "# Root Conventions",
      "REVIEW.md": "# Root Review Rules",
    });
    try {
      const opts = makeOpts(dir);
      await handleDryRun(opts);
      const call = opts.notify.mock.calls.find(c => String(c[0]).includes("System prompt:"));
      expect(call).toBeDefined();
      expect(call![0]).toContain("# Root Conventions");
      expect(call![0]).toContain("# Root Review Rules");
    } finally { await cleanup(); }
  });
});

describe("context loading — monorepo (--dir)", () => {
  it("parent AGENTS.md and package REVIEW.md both appear when using --dir", async () => {
    // dir is the monorepo root; --dir points to the nested package
    const { dir, cleanup } = await createTempProject({
      "AGENTS.md": "# Monorepo Root Conventions",
      "packages/api/REVIEW.md": "# Package Review Rules",
    });
    try {
      const opts = makeOpts(dir, { dir: "packages/api" });
      await handleDryRun(opts);
      const call = opts.notify.mock.calls.find(c => String(c[0]).includes("System prompt:"));
      expect(call).toBeDefined();
      expect(call![0]).toContain("# Monorepo Root Conventions");
      expect(call![0]).toContain("# Package Review Rules");
    } finally { await cleanup(); }
  });

  it("only package REVIEW.md appears when no root context files exist", async () => {
    const { dir, cleanup } = await createTempProject({
      "packages/api/REVIEW.md": "# Package Only Rules",
    });
    try {
      const opts = makeOpts(dir, { dir: "packages/api" });
      await handleDryRun(opts);
      const call = opts.notify.mock.calls.find(c => String(c[0]).includes("System prompt:"));
      expect(call).toBeDefined();
      expect(call![0]).toContain("# Package Only Rules");
    } finally { await cleanup(); }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importActual) => {
  const actual = await importActual<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn().mockImplementation((path: unknown, ...args: unknown[]) => {
      if (String(path).includes("pi-reviewer-doc-context")) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      return (actual.readFileSync as (path: unknown, ...args: unknown[]) => unknown)(path, ...args);
    }),
  };
});

import registerExtension from "../../extensions/pi-reviewer-doc-context/index.js";
import { extractKeywords, parseDescription, isRelevant } from "../../extensions/pi-reviewer-doc-context/index.js";

describe("extractKeywords", () => {
  it("returns empty array for empty diffFiles", () => {
    expect(extractKeywords([])).toHaveLength(0);
  });

  it("extracts path segments", () => {
    const kws = extractKeywords(["src/auth/login.ts"]);
    expect(kws).toContain("auth");
    expect(kws).toContain("login");
  });

  it("strips file extensions", () => {
    const kws = extractKeywords(["src/auth/login.ts"]);
    expect(kws).not.toContain("ts");
  });

  it("splits on dashes and underscores", () => {
    const kws = extractKeywords(["src/diff-resolver.ts"]);
    expect(kws).toContain("diff");
    expect(kws).toContain("resolver");
  });

  it("splits camelCase segments", () => {
    const kws = extractKeywords(["ui/src/ContextPanel.tsx"]);
    expect(kws).toContain("context");
    expect(kws).toContain("panel");
  });

  it("lowercases all keywords", () => {
    const kws = extractKeywords(["src/AuthService.ts"]);
    expect(kws).toContain("auth");
    expect(kws).toContain("service");
    expect(kws).not.toContain("Auth");
  });

  it("deduplicates across multiple files", () => {
    const kws = extractKeywords(["src/auth/login.ts", "src/auth/logout.ts"]);
    expect(kws.filter(k => k === "auth")).toHaveLength(1);
    expect(kws.filter(k => k === "src")).toHaveLength(1);
  });

  it("ignores segments shorter than 3 chars", () => {
    const kws = extractKeywords(["ui/src/app.ts"]);
    expect(kws).not.toContain("ui");
  });
});

describe("parseDescription", () => {
  it("returns null when no frontmatter", () => {
    expect(parseDescription("# Just a heading\n\nsome content")).toBeNull();
  });

  it("returns null when frontmatter has no description field", () => {
    expect(parseDescription("---\ntitle: My Doc\n---\n# Content")).toBeNull();
  });

  it("extracts description from frontmatter", () => {
    const content = "---\ndescription: Authentication and token handling\n---\n# Auth Guide\n\ncontent";
    expect(parseDescription(content)).toBe("Authentication and token handling");
  });

  it("trims whitespace from description value", () => {
    expect(parseDescription("---\ndescription:   trimmed   \n---\n")).toBe("trimmed");
  });

  it("ignores other frontmatter fields", () => {
    const content = "---\ntitle: Auth Guide\ndescription: Token lifecycle\nauthor: dev\n---\n";
    expect(parseDescription(content)).toBe("Token lifecycle");
  });
});

describe("isRelevant", () => {
  it("returns true when keyword matches description", () => {
    expect(isRelevant("Authentication and token handling", "auth-guide.md", ["auth"])).toBe(true);
  });

  it("returns true when keyword matches file path", () => {
    expect(isRelevant("General project guide", "auth-guide.md", ["auth"])).toBe(true);
  });

  it("returns false when no keywords match", () => {
    expect(isRelevant("Deployment to production", "deploy.md", ["auth", "token"])).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isRelevant("Authentication flows", "auth.md", ["authentication"])).toBe(true);
  });

  it("returns false for empty keywords", () => {
    expect(isRelevant("Authentication flows", "auth.md", [])).toBe(false);
  });

  it("matches on any keyword, not all", () => {
    expect(isRelevant("Token expiry policy", "tokens.md", ["auth", "token", "deploy"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Walk-up behaviour via provider capture
// ---------------------------------------------------------------------------

const CONTEXT_PROVIDER_EVENT = "pi-reviewer:collect-context-providers";

function makeFakeFsOps(files: Record<string, string>) {
  return {
    read: async (p: string): Promise<string | null> => files[p] ?? null,
    list: async (p: string): Promise<string[]> => {
      const prefix = p.endsWith("/") ? p : `${p}/`;
      const seen = new Set<string>();
      for (const key of Object.keys(files)) {
        if (key.startsWith(prefix)) {
          const segment = key.slice(prefix.length).split("/")[0];
          if (segment) seen.add(segment);
        }
      }
      return [...seen];
    },
    join: (...parts: string[]) => parts.join("/").replace(/\/+/g, "/"),
    dirname: (p: string) => {
      const i = p.lastIndexOf("/");
      return i <= 0 ? "/" : p.slice(0, i);
    },
  };
}

function captureProvider() {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  const events = {
    emit(channel: string, data: unknown) { for (const h of handlers.get(channel) ?? []) h(data); },
    on(channel: string, handler: (data: unknown) => void) {
      if (!handlers.has(channel)) handlers.set(channel, []);
      handlers.get(channel)!.push(handler);
      return () => {};
    },
  };

  registerExtension({ events } as any);

  let captured: ((opts: { cwd: string; diffFiles: string[]; fs: any; gitRoot?: string }) => Promise<{ path: string; content: string }[]>) | null = null;
  events.emit(CONTEXT_PROVIDER_EVENT, {
    cwd: "",
    diffFiles: [],
    register: (_name: string, provider: typeof captured) => { captured = provider; },
  });

  if (!captured) throw new Error("Provider was not registered");
  return captured;
}

const docContent = (description: string) =>
  `---\ndescription: ${description}\n---\n# Guide\n\ncontent`;

describe("doc-context provider — walk-up (gitRoot)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("without gitRoot only scans cwd — parent doc not found", async () => {
    const provider = captureProvider();
    const fs = makeFakeFsOps({
      "/repo/.pi/notes/deploy.md": docContent("deploy pipeline"),
      "/repo/app/.pi/notes/auth.md": docContent("auth token handling"),
    });
    const files = await provider({ cwd: "/repo/app", diffFiles: ["deploy.ts", "auth.ts"], fs });
    const paths = files.map(f => f.path);
    expect(paths).toContain(".pi/notes/auth.md");
    expect(paths).not.toContain("../.pi/notes/deploy.md");
  });

  it("with gitRoot finds doc at parent level", async () => {
    const provider = captureProvider();
    const fs = makeFakeFsOps({
      "/repo/.pi/notes/deploy.md": docContent("deploy pipeline"),
      "/repo/app/.pi/notes/auth.md": docContent("auth token handling"),
    });
    const files = await provider({ cwd: "/repo/app", diffFiles: ["deploy.ts", "auth.ts"], fs, gitRoot: "/repo" });
    const paths = files.map(f => f.path);
    expect(paths).toContain(".pi/notes/auth.md");
    expect(paths).toContain("../.pi/notes/deploy.md");
  });

  it("parent doc path uses ../ prefix", async () => {
    const provider = captureProvider();
    const fs = makeFakeFsOps({
      "/repo/.pi/notes/deploy.md": docContent("deploy pipeline"),
    });
    const files = await provider({ cwd: "/repo/app", diffFiles: ["deploy.ts"], fs, gitRoot: "/repo" });
    expect(files[0]?.path).toBe("../.pi/notes/deploy.md");
  });

  it("returns empty when diffFiles is empty (no keywords)", async () => {
    const provider = captureProvider();
    const fs = makeFakeFsOps({
      "/repo/.pi/notes/auth.md": docContent("auth token handling"),
    });
    const files = await provider({ cwd: "/repo", diffFiles: [], fs, gitRoot: "/repo" });
    expect(files).toHaveLength(0);
  });

  it("irrelevant docs are filtered out", async () => {
    const provider = captureProvider();
    const fs = makeFakeFsOps({
      "/repo/app/.pi/notes/deploy.md": docContent("deploy pipeline"),
    });
    const files = await provider({ cwd: "/repo/app", diffFiles: ["auth.ts"], fs });
    expect(files).toHaveLength(0);
  });
});

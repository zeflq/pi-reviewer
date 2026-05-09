import { describe, expect, it } from "vitest";
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

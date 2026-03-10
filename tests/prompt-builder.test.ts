import { describe, expect, it } from "vitest";

import { buildSystemPrompt, buildUserPrompt } from "../src/prompt-builder.js";

describe("prompt-builder", () => {
  it("buildSystemPrompt('') returns base prompt without conventions section", () => {
    const prompt = buildSystemPrompt("");

    expect(prompt).toContain("You are a code reviewer");
    expect(prompt).toContain("Return only a JSON object with this exact shape");
    expect(prompt).not.toContain("--- Project conventions");
  });

  it("buildSystemPrompt('use tabs') appends conventions context", () => {
    const prompt = buildSystemPrompt("use tabs");

    expect(prompt).toContain("--- Project conventions (AGENTS.md / CLAUDE.md) ---");
    expect(prompt).toContain("use tabs");
  });

  it("buildUserPrompt('some diff') returns text containing diff", () => {
    const prompt = buildUserPrompt("some diff");

    expect(prompt).toContain("Review this diff:");
    expect(prompt).toContain("some diff");
  });

  it("buildUserPrompt appends skipped files notice when provided", () => {
    const prompt = buildUserPrompt("some diff", ["src/big.ts", "src/huge.ts"]);

    expect(prompt).toContain("not reviewed");
    expect(prompt).toContain("src/big.ts");
    expect(prompt).toContain("src/huge.ts");
  });

  it("buildUserPrompt does not append notice when skippedFiles is empty", () => {
    const prompt = buildUserPrompt("some diff", []);

    expect(prompt).not.toContain("not reviewed");
  });

  it("system prompt includes JSON keys summary and comments", () => {
    const prompt = buildSystemPrompt("");

    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"comments"');
  });

  it("buildSystemPrompt with minSeverity WARN adds skip-INFO rule", () => {
    const prompt = buildSystemPrompt("", "WARN");

    expect(prompt).toContain("skip INFO");
    expect(prompt).not.toContain("skip WARN");
  });

  it("buildSystemPrompt with minSeverity CRITICAL adds skip-WARN-and-INFO rule", () => {
    const prompt = buildSystemPrompt("", "CRITICAL");

    expect(prompt).toContain("skip WARN and INFO");
  });

  it("buildSystemPrompt with default minSeverity adds no skip rule", () => {
    const prompt = buildSystemPrompt("");

    expect(prompt).not.toContain("skip INFO");
    expect(prompt).not.toContain("skip WARN");
  });
});

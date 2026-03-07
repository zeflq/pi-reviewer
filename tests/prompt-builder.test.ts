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

  it("system prompt includes JSON keys summary and comments", () => {
    const prompt = buildSystemPrompt("");

    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"comments"');
  });
});

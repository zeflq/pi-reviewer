import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../../src/core/prompt-builder.js";
describe("prompt-builder", () => {
    it("returns base prompt without sections when context is empty", () => {
        const prompt = buildSystemPrompt({ conventions: "", reviewRules: "" });
        expect(prompt).toContain("You are a code reviewer");
        expect(prompt).toContain("Return only a JSON object with this exact shape");
        expect(prompt).not.toContain("--- Project conventions");
        expect(prompt).not.toContain("--- Review-specific rules");
    });
    it("appends conventions section when conventions is provided", () => {
        const prompt = buildSystemPrompt({ conventions: "use tabs", reviewRules: "" });
        expect(prompt).toContain("--- Project conventions (AGENTS.md / CLAUDE.md) ---");
        expect(prompt).toContain("use tabs");
        expect(prompt).not.toContain("--- Review-specific rules");
    });
    it("appends review rules section when reviewRules is provided", () => {
        const prompt = buildSystemPrompt({ conventions: "", reviewRules: "always check res.ok" });
        expect(prompt).toContain("--- Review-specific rules (REVIEW.md) ---");
        expect(prompt).toContain("always check res.ok");
        expect(prompt).not.toContain("--- Project conventions");
    });
    it("appends both sections when both are provided", () => {
        const prompt = buildSystemPrompt({ conventions: "use tabs", reviewRules: "always check res.ok" });
        expect(prompt).toContain("--- Project conventions (AGENTS.md / CLAUDE.md) ---");
        expect(prompt).toContain("use tabs");
        expect(prompt).toContain("--- Review-specific rules (REVIEW.md) ---");
        expect(prompt).toContain("always check res.ok");
    });
    it("still accepts a plain string for backward compat", () => {
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
        const prompt = buildSystemPrompt({ conventions: "", reviewRules: "" });
        expect(prompt).toContain('"summary"');
        expect(prompt).toContain('"comments"');
    });
    it("buildSystemPrompt with minSeverity WARN adds skip-INFO rule", () => {
        const prompt = buildSystemPrompt({ conventions: "", reviewRules: "" }, "WARN");
        expect(prompt).toContain("skip INFO");
        expect(prompt).not.toContain("skip WARN");
    });
    it("buildSystemPrompt with minSeverity CRITICAL adds skip-WARN-and-INFO rule", () => {
        const prompt = buildSystemPrompt({ conventions: "", reviewRules: "" }, "CRITICAL");
        expect(prompt).toContain("skip WARN and INFO");
    });
    it("buildSystemPrompt with default minSeverity adds no skip rule", () => {
        const prompt = buildSystemPrompt({ conventions: "", reviewRules: "" });
        expect(prompt).not.toContain("skip INFO");
        expect(prompt).not.toContain("skip WARN");
    });
});

import { describe, expect, it } from "vitest";
import { buildJSONSystemPrompt, buildMarkdownSystemPrompt, buildSSHUserPrompt, buildUserPrompt } from "../../src/core/prompt-builder.js";
describe("prompt-builder", () => {
    it("returns base prompt without sections when context is empty", () => {
        const prompt = buildJSONSystemPrompt({ conventions: "", reviewRules: "" });
        expect(prompt).toContain("You are a code reviewer");
        expect(prompt).toContain("Return only a JSON object with this exact shape");
        expect(prompt).not.toContain("--- Project conventions");
        expect(prompt).not.toContain("--- Review-specific rules");
    });
    it("appends conventions section when conventions is provided", () => {
        const prompt = buildJSONSystemPrompt({ conventions: "use tabs", reviewRules: "" });
        expect(prompt).toContain("--- Project conventions (AGENTS.md / CLAUDE.md) ---");
        expect(prompt).toContain("use tabs");
        expect(prompt).not.toContain("--- Review-specific rules");
    });
    it("appends review rules section when reviewRules is provided", () => {
        const prompt = buildJSONSystemPrompt({ conventions: "", reviewRules: "always check res.ok" });
        expect(prompt).toContain("--- Review-specific rules (REVIEW.md) ---");
        expect(prompt).toContain("always check res.ok");
        expect(prompt).not.toContain("--- Project conventions");
    });
    it("appends both sections when both are provided", () => {
        const prompt = buildJSONSystemPrompt({ conventions: "use tabs", reviewRules: "always check res.ok" });
        expect(prompt).toContain("--- Project conventions (AGENTS.md / CLAUDE.md) ---");
        expect(prompt).toContain("use tabs");
        expect(prompt).toContain("--- Review-specific rules (REVIEW.md) ---");
        expect(prompt).toContain("always check res.ok");
    });
    it("still accepts a plain string for backward compat", () => {
        const prompt = buildJSONSystemPrompt("use tabs");
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
        const prompt = buildJSONSystemPrompt({ conventions: "", reviewRules: "" });
        expect(prompt).toContain('"summary"');
        expect(prompt).toContain('"comments"');
    });
    it("buildJSONSystemPrompt with minSeverity WARN adds skip-INFO rule", () => {
        const prompt = buildJSONSystemPrompt({ conventions: "", reviewRules: "" }, "WARN");
        expect(prompt).toContain("skip INFO");
        expect(prompt).not.toContain("skip WARN");
    });
    it("buildJSONSystemPrompt with minSeverity CRITICAL adds skip-WARN-and-INFO rule", () => {
        const prompt = buildJSONSystemPrompt({ conventions: "", reviewRules: "" }, "CRITICAL");
        expect(prompt).toContain("skip WARN and INFO");
    });
    it("buildJSONSystemPrompt with default minSeverity adds no skip rule", () => {
        const prompt = buildJSONSystemPrompt({ conventions: "", reviewRules: "" });
        expect(prompt).not.toContain("skip INFO");
        expect(prompt).not.toContain("skip WARN");
    });
});
describe("buildMarkdownSystemPrompt", () => {
    it("returns markdown format, not JSON schema", () => {
        const prompt = buildMarkdownSystemPrompt();
        expect(prompt).toContain("Write your review as Markdown");
        expect(prompt).not.toContain("Return only a JSON object");
    });
    it("includes save instruction", () => {
        const prompt = buildMarkdownSystemPrompt();
        expect(prompt).toContain("save it to pi-review.md");
    });
    it("includes shared base content", () => {
        const prompt = buildMarkdownSystemPrompt();
        expect(prompt).toContain("You are a code reviewer");
        expect(prompt).toContain("🔴 CRITICAL");
    });
    it("respects minSeverity filter", () => {
        const prompt = buildMarkdownSystemPrompt("WARN");
        expect(prompt).toContain("skip INFO");
    });
});
describe("buildSSHUserPrompt", () => {
    it("includes read AGENTS.md instruction", () => {
        const prompt = buildSSHUserPrompt("git diff HEAD~1");
        expect(prompt).toContain("AGENTS.md");
        expect(prompt).toContain("CLAUDE.md");
        expect(prompt).toContain("REVIEW.md");
    });
    it("includes the diff command", () => {
        const prompt = buildSSHUserPrompt("gh pr diff 42");
        expect(prompt).toContain("gh pr diff 42");
    });
    it("instructs agent to run the command first", () => {
        const prompt = buildSSHUserPrompt("git diff HEAD~1");
        expect(prompt).toContain("Run this command NOW to get the current diff");
    });
});

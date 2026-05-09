import { describe, expect, it } from "vitest";
import { resolveCurrentModelId } from "../../extensions/pi-reviewer/model.js";

const models = [
  { id: "claude-sonnet-4-6", name: "Claude Sonnet", provider: "anthropic" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
];

describe("resolveCurrentModelId", () => {
  it("returns undefined when no model and no session model", () => {
    expect(resolveCurrentModelId(undefined, models, undefined)).toBeUndefined();
  });

  it("resolves from session model when no explicit model given", () => {
    const session = { id: "claude-sonnet-4-6", provider: "anthropic" };
    expect(resolveCurrentModelId(undefined, models, session))
      .toBe("anthropic/claude-sonnet-4-6");
  });

  it("matches by bare model id", () => {
    expect(resolveCurrentModelId("gpt-4o", models, undefined))
      .toBe("openai/gpt-4o");
  });

  it("matches by provider/id string", () => {
    expect(resolveCurrentModelId("anthropic/claude-sonnet-4-6", models, undefined))
      .toBe("anthropic/claude-sonnet-4-6");
  });

  it("falls back to the raw model string when no registry match", () => {
    expect(resolveCurrentModelId("custom/unknown-model", models, undefined))
      .toBe("custom/unknown-model");
  });

  it("prefers explicit model over session model", () => {
    const session = { id: "gpt-4o", provider: "openai" };
    expect(resolveCurrentModelId("claude-sonnet-4-6", models, session))
      .toBe("anthropic/claude-sonnet-4-6");
  });
});

import { describe, it, expect } from "vitest";
import { parseArgs } from "../../extensions/pi-reviewer/args.js";

describe("parseArgs defaults", () => {
  it("minSeverity is undefined when not passed", () => {
    expect(parseArgs("").minSeverity).toBeUndefined();
  });

  it("thinking is undefined when not passed", () => {
    expect(parseArgs("").thinking).toBeUndefined();
  });

  it("model is undefined when not passed", () => {
    expect(parseArgs("").model).toBeUndefined();
  });

  it("verbose is undefined when not passed", () => {
    expect(parseArgs("").verbose).toBeUndefined();
  });
});

describe("parseArgs --verbose", () => {
  it("parses --verbose flag", () => {
    expect(parseArgs("--verbose").verbose).toBe(true);
  });
});

describe("parseArgs --model", () => {
  it("parses --model with provider/id", () => {
    expect(parseArgs("--model anthropic/claude-sonnet-4").model).toBe("anthropic/claude-sonnet-4");
  });

  it("parses --model with bare id", () => {
    expect(parseArgs("--model gpt-4o").model).toBe("gpt-4o");
  });

  it("throws when --model has no value", () => {
    expect(() => parseArgs("--model")).toThrow("Missing value for --model");
  });
});

describe("parseArgs --thinking", () => {
  it.each(["off", "minimal", "low", "medium", "high", "xhigh"])("parses --thinking %s", (level) => {
    expect(parseArgs(`--thinking ${level}`).thinking).toBe(level);
  });

  it("throws on unknown thinking level", () => {
    expect(() => parseArgs("--thinking turbo")).toThrow("Invalid thinking level");
  });

  it("throws when --thinking has no value", () => {
    expect(() => parseArgs("--thinking")).toThrow("Missing value for --thinking");
  });
});

describe("parseArgs combinations", () => {
  it("parses --model and --thinking together", () => {
    const result = parseArgs("--model openai/gpt-4o --thinking low");
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.thinking).toBe("low");
  });

  it("parses all flags together", () => {
    const result = parseArgs("--verbose --min-severity warn --thinking low --model openai/gpt-4o");
    expect(result.verbose).toBe(true);
    expect(result.minSeverity).toBe("WARN");
    expect(result.thinking).toBe("low");
    expect(result.model).toBe("openai/gpt-4o");
  });
});

import { describe, expect, it, vi } from "vitest";

import { extractAssistantText } from "../../src/core/output.js";
import { createEventAccumulator, sumMessagesUsage } from "../../extensions/pi-reviewer/events.js";

describe("extractAssistantText", () => {
  it("returns empty string for non-assistant message", () => {
    expect(extractAssistantText({ role: "user", content: "hello" })).toBe("");
  });

  it("returns string content directly", () => {
    expect(extractAssistantText({ role: "assistant", content: "LGTM" })).toBe("LGTM");
  });

  it("concatenates text parts from content array", () => {
    const msg = {
      role: "assistant",
      content: [{ type: "text", text: "hello" }, { type: "text", text: " world" }],
    };
    expect(extractAssistantText(msg)).toBe("hello world");
  });

  it("skips non-text parts", () => {
    const msg = {
      role: "assistant",
      content: [{ type: "tool_use", id: "x" }, { type: "text", text: "done" }],
    };
    expect(extractAssistantText(msg)).toBe("done");
  });

  it("returns empty string for undefined message", () => {
    expect(extractAssistantText(undefined)).toBe("");
  });
});

describe("createEventAccumulator", () => {
  it("captures text from turn_end event", () => {
    const acc = createEventAccumulator(() => {});
    acc.process(JSON.stringify({
      type: "turn_end",
      message: { role: "assistant", content: "Review result" },
    }));
    expect(acc.getLastReviewText()).toBe("Review result");
  });

  it("keeps last non-empty text across multiple turn_end events", () => {
    const acc = createEventAccumulator(() => {});
    acc.process(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: "" } }));
    acc.process(JSON.stringify({ type: "turn_end", message: { role: "user", content: "ignored" } }));
    acc.process(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: "Final review" } }));
    expect(acc.getLastReviewText()).toBe("Final review");
  });

  it("does not overwrite with empty text from intermediate tool-use turns", () => {
    const acc = createEventAccumulator(() => {});
    acc.process(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: "First review" } }));
    acc.process(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: [{ type: "tool_use", id: "x" }] } }));
    expect(acc.getLastReviewText()).toBe("First review");
  });

  it("ignores non-turn_end events", () => {
    const acc = createEventAccumulator(() => {});
    acc.process(JSON.stringify({ type: "agent_start", message: { role: "assistant", content: "ignored" } }));
    expect(acc.getLastReviewText()).toBe("");
  });

  it("calls onUnexpected for non-JSON lines", () => {
    const onUnexpected = vi.fn();
    const acc = createEventAccumulator(onUnexpected);
    acc.process("not json at all");
    expect(onUnexpected).toHaveBeenCalledWith("not json at all");
    expect(acc.getLastReviewText()).toBe("");
  });

  it("skips blank lines silently", () => {
    const onUnexpected = vi.fn();
    const acc = createEventAccumulator(onUnexpected);
    acc.process("   ");
    expect(onUnexpected).not.toHaveBeenCalled();
  });

  describe("getTokenUsage", () => {
    function makeUsage(input: number, output: number, cost = 0) {
      return { input, output, cacheRead: 0, cacheWrite: 0, totalTokens: input + output, cost: { total: cost } };
    }

    it("returns undefined when no turn_end had usage", () => {
      const acc = createEventAccumulator(() => {});
      acc.process(JSON.stringify({ type: "turn_end", message: { role: "assistant", content: "ok" } }));
      expect(acc.getTokenUsage()).toBeUndefined();
    });

    it("captures usage from a single turn_end", () => {
      const acc = createEventAccumulator(() => {});
      acc.process(JSON.stringify({
        type: "turn_end",
        message: { role: "assistant", content: "ok", usage: makeUsage(100, 50, 0.002) },
      }));
      expect(acc.getTokenUsage()).toMatchObject({ inputTokens: 100, outputTokens: 50, totalTokens: 150, cost: 0.002 });
    });

    it("accumulates usage across multiple turn_end events", () => {
      const acc = createEventAccumulator(() => {});
      acc.process(JSON.stringify({
        type: "turn_end",
        message: { role: "assistant", content: "thinking", usage: makeUsage(200, 10, 0.001) },
      }));
      acc.process(JSON.stringify({
        type: "turn_end",
        message: { role: "assistant", content: "done", usage: makeUsage(300, 80, 0.003) },
      }));
      expect(acc.getTokenUsage()).toMatchObject({ inputTokens: 500, outputTokens: 90, totalTokens: 590, cost: 0.004 });
    });

    it("ignores turn_end with stopReason error and does not accumulate its usage", () => {
      const acc = createEventAccumulator(() => {});
      acc.process(JSON.stringify({
        type: "turn_end",
        message: { role: "assistant", content: "ok", stopReason: "error", usage: makeUsage(100, 50) },
      }));
      expect(acc.getTokenUsage()).toBeUndefined();
    });
  });
});

describe("sumMessagesUsage", () => {
  function makeAssistant(input: number, output: number, cost = 0) {
    return { role: "assistant", usage: { input, output, cacheRead: 0, cacheWrite: 0, totalTokens: input + output, cost: { total: cost } } };
  }

  it("returns undefined for an empty array", () => {
    expect(sumMessagesUsage([])).toBeUndefined();
  });

  it("returns undefined when no assistant messages present", () => {
    expect(sumMessagesUsage([{ role: "user" }, { role: "toolResult" }])).toBeUndefined();
  });

  it("sums usage from a single assistant message", () => {
    expect(sumMessagesUsage([makeAssistant(100, 50, 0.002)])).toMatchObject({
      inputTokens: 100, outputTokens: 50, totalTokens: 150, cost: 0.002,
    });
  });

  it("sums usage across multiple assistant messages", () => {
    expect(sumMessagesUsage([makeAssistant(100, 20, 0.001), makeAssistant(200, 80, 0.003)])).toMatchObject({
      inputTokens: 300, outputTokens: 100, totalTokens: 400, cost: 0.004,
    });
  });

  it("ignores non-assistant messages", () => {
    const messages = [{ role: "user" }, makeAssistant(100, 50), { role: "toolResult" }];
    expect(sumMessagesUsage(messages)).toMatchObject({ inputTokens: 100, outputTokens: 50 });
  });
});

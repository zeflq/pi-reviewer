import { describe, expect, it, vi } from "vitest";

import { createEventAccumulator, extractAssistantText } from "../extensions/pi-reviewer/events.js";

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
});

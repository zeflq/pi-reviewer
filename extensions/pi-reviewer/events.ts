import { extractAssistantText, type TokenUsage } from "../../src/core/output.js";

export interface EventAccumulator {
  process(line: string): void;
  getLastReviewText(): string;
  getTokenUsage(): TokenUsage | undefined;
  hadThinkingOnly(): boolean;
  hadAPIError(): boolean;
}

export interface EventAccumulatorOptions {
  onProgress?: (text: string) => void;
}

type RawUsage = { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; cost: { total: number } };
type RawUsageMessage = { role?: string; usage?: RawUsage };

function accumulateUsage(acc: TokenUsage, u: RawUsage): void {
  acc.inputTokens += u.input;
  acc.outputTokens += u.output;
  acc.cacheReadTokens += u.cacheRead;
  acc.cacheWriteTokens += u.cacheWrite;
  acc.totalTokens += u.totalTokens;
  acc.cost += u.cost.total;
  acc.turns += 1;
}

function emptyUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0, turns: 0 };
}

export function createEventAccumulator(
  onUnexpected: (line: string) => void,
  options?: EventAccumulatorOptions
): EventAccumulator {
  let lastReviewText = "";
  let tokenUsage: TokenUsage | undefined;
  let thinkingBuf = "";
  let textStarted = false;
  let hadThinking = false;
  let apiError = false;

  return {
    process(line: string) {
      if (!line.trim()) return;

      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        onUnexpected(line);
        return;
      }

      const ev = event as {
        type?: string;
        message?: unknown;
        assistantMessageEvent?: { type?: string; delta?: string };
      };

      if (ev?.type === "turn_end") {
        const msg = ev.message as (RawUsageMessage & { stopReason?: string }) | undefined;
        if (msg?.stopReason === "error") {
          apiError = true;
          return;
        }
        if (msg?.usage) {
          if (!tokenUsage) tokenUsage = emptyUsage();
          accumulateUsage(tokenUsage, msg.usage);
        }
        const text = extractAssistantText(ev.message);
        if (text) lastReviewText = text;
      } else if (ev?.type === "message_update") {
        const aev = ev.assistantMessageEvent;
        if (!aev || !options?.onProgress) return;

        if (aev.type === "thinking_start" || aev.type === "thinking_delta") {
          hadThinking = true;
        }

        if (aev.type === "thinking_start") {
          options.onProgress("Thinking…");
        } else if (aev.type === "thinking_delta" && aev.delta) {
          thinkingBuf += aev.delta;
          const sentenceEnd = Math.max(thinkingBuf.lastIndexOf(". "), thinkingBuf.lastIndexOf(".\n"));
          if (sentenceEnd > 60) {
            options.onProgress(thinkingBuf.slice(0, sentenceEnd + 1).trim());
            thinkingBuf = thinkingBuf.slice(sentenceEnd + 1);
          }
        } else if (aev.type === "text_start" && !textStarted) {
          textStarted = true;
          options.onProgress("Writing review…");
        }
      }
    },

    getLastReviewText() {
      return lastReviewText;
    },

    getTokenUsage() {
      return tokenUsage;
    },

    hadThinkingOnly() {
      return hadThinking && !lastReviewText;
    },

    hadAPIError() {
      return apiError;
    },
  };
}

export function sumMessagesUsage(messages: unknown[]): TokenUsage | undefined {
  const acc = emptyUsage();
  for (const msg of messages) {
    const m = msg as RawUsageMessage;
    if (m.role === "assistant" && m.usage) accumulateUsage(acc, m.usage);
  }
  return acc.totalTokens > 0 ? acc : undefined;
}

export function extractAssistantText(message: unknown): string {
  const msg = message as { role?: string; content?: unknown };
  if (msg?.role !== "assistant") return "";

  if (typeof msg.content === "string") return msg.content;

  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "type" in part && (part as { type?: string }).type === "text") {
          return (part as { text?: string }).text ?? "";
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

export function extractLastAssistantText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const text = extractAssistantText(messages[i]);
    if (text) return text;
  }
  return "";
}

export interface EventAccumulator {
  process(line: string): void;
  getLastReviewText(): string;
}

export interface EventAccumulatorOptions {
  onProgress?: (text: string) => void;
}

export function createEventAccumulator(
  onUnexpected: (line: string) => void,
  options?: EventAccumulatorOptions
): EventAccumulator {
  let lastReviewText = "";
  let thinkingBuf = "";
  let textStarted = false;

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
        const text = extractAssistantText(ev.message);
        if (text) lastReviewText = text;
      } else if (ev?.type === "message_update") {
        const aev = ev.assistantMessageEvent;
        if (!aev || !options?.onProgress) return;

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
  };
}

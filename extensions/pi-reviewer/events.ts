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

export function createEventAccumulator(onUnexpected: (line: string) => void): EventAccumulator {
  let lastReviewText = "";

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

      const ev = event as { type?: string; message?: unknown };
      if (ev?.type === "turn_end") {
        const text = extractAssistantText(ev.message);
        if (text) lastReviewText = text;
      }
    },

    getLastReviewText() {
      return lastReviewText;
    },
  };
}

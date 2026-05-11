import { extractAssistantText } from "../../src/core/output.js";
export function createEventAccumulator(onUnexpected, options) {
    let lastReviewText = "";
    let tokenUsage;
    let thinkingBuf = "";
    let textStarted = false;
    let hadThinking = false;
    let apiError = false;
    return {
        process(line) {
            if (!line.trim())
                return;
            let event;
            try {
                event = JSON.parse(line);
            }
            catch {
                onUnexpected(line);
                return;
            }
            const ev = event;
            if (ev?.type === "turn_end") {
                const msg = ev.message;
                if (msg?.stopReason === "error") {
                    apiError = true;
                    return;
                }
                if (msg?.usage) {
                    const u = msg.usage;
                    tokenUsage = {
                        inputTokens: u.input,
                        outputTokens: u.output,
                        cacheReadTokens: u.cacheRead,
                        cacheWriteTokens: u.cacheWrite,
                        totalTokens: u.totalTokens,
                        cost: u.cost.total,
                    };
                }
                const text = extractAssistantText(ev.message);
                if (text)
                    lastReviewText = text;
            }
            else if (ev?.type === "message_update") {
                const aev = ev.assistantMessageEvent;
                if (!aev || !options?.onProgress)
                    return;
                if (aev.type === "thinking_start" || aev.type === "thinking_delta") {
                    hadThinking = true;
                }
                if (aev.type === "thinking_start") {
                    options.onProgress("Thinking…");
                }
                else if (aev.type === "thinking_delta" && aev.delta) {
                    thinkingBuf += aev.delta;
                    const sentenceEnd = Math.max(thinkingBuf.lastIndexOf(". "), thinkingBuf.lastIndexOf(".\n"));
                    if (sentenceEnd > 60) {
                        options.onProgress(thinkingBuf.slice(0, sentenceEnd + 1).trim());
                        thinkingBuf = thinkingBuf.slice(sentenceEnd + 1);
                    }
                }
                else if (aev.type === "text_start" && !textStarted) {
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

export function extractAssistantText(message) {
    const msg = message;
    if (msg?.role !== "assistant")
        return "";
    if (typeof msg.content === "string")
        return msg.content;
    if (Array.isArray(msg.content)) {
        return msg.content
            .map((part) => {
            if (typeof part === "string")
                return part;
            if (part && typeof part === "object" && "type" in part && part.type === "text") {
                return part.text ?? "";
            }
            return "";
        })
            .join("")
            .trim();
    }
    return "";
}
export function extractLastAssistantText(messages) {
    if (!Array.isArray(messages))
        return "";
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const text = extractAssistantText(messages[i]);
        if (text)
            return text;
    }
    return "";
}
export function createEventAccumulator(onUnexpected, options) {
    let lastReviewText = "";
    let thinkingBuf = "";
    let textStarted = false;
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
                const text = extractAssistantText(ev.message);
                if (text)
                    lastReviewText = text;
            }
            else if (ev?.type === "message_update") {
                const aev = ev.assistantMessageEvent;
                if (!aev || !options?.onProgress)
                    return;
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
    };
}

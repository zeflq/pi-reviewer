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
export function createEventAccumulator(onUnexpected) {
    let lastReviewText = "";
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
        },
        getLastReviewText() {
            return lastReviewText;
        },
    };
}

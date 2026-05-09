import { parseAgentResponse, extractLastAssistantText } from "../../src/core/output.js";
export function runSSHReview(opts) {
    const { systemPrompt, userPrompt, pi, stopLoader, notify } = opts;
    let done = false;
    pi.on("before_agent_start", async () => {
        if (done)
            return {};
        return { systemPrompt };
    });
    pi.on("agent_end", async () => {
        if (done)
            return;
        done = true;
        stopLoader();
        notify("Review saved → pi-review.md");
    });
    pi.sendUserMessage(userPrompt);
}
export function runSSHReviewAndWait(opts) {
    const { systemPrompt, userPrompt, diff, pi, minSeverity, stopLoader, notify } = opts;
    let done = false;
    return new Promise((resolve, reject) => {
        pi.on("before_agent_start", async () => {
            if (done)
                return {};
            return { systemPrompt };
        });
        pi.on("agent_end", async (event) => {
            if (done)
                return;
            done = true;
            stopLoader();
            const text = extractLastAssistantText(event.messages);
            if (!text) {
                reject(new Error("SSH agent returned an empty response"));
                return;
            }
            try {
                const result = parseAgentResponse(text, minSeverity);
                resolve({ ...result, diff });
            }
            catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
        pi.sendUserMessage(userPrompt);
    });
}

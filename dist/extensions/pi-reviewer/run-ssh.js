import { parseAgentResponse } from "../../src/core/output.js";
import { extractLastAssistantText } from "./events.js";
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
    const { systemPrompt, userPrompt, pi, minSeverity, stopLoader, notify } = opts;
    let done = false;
    let capturedDiff;
    return new Promise((resolve, reject) => {
        // Capture the diff from the bash tool result so we can pass it to the UI
        // without asking the agent to echo it back in the JSON response.
        pi.on("tool_result", async (event) => {
            if (done || event.toolName !== "bash")
                return;
            const output = event.content
                .map((c) => ("text" in c ? c.text : ""))
                .join("");
            if (output.includes("diff --git ")) {
                capturedDiff = output;
            }
        });
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
                resolve({ ...result, ...(capturedDiff !== undefined ? { diff: capturedDiff } : {}) });
            }
            catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        });
        pi.sendUserMessage(userPrompt);
    });
}

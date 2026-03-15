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

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface RunSSHOptions {
  systemPrompt: string;
  userPrompt: string;
  pi: ExtensionAPI;
  stopLoader: () => void;
  notify: (msg: string) => void;
}

export function runSSHReview(opts: RunSSHOptions): void {
  const { systemPrompt, userPrompt, pi, stopLoader, notify } = opts;
  let done = false;

  pi.on("before_agent_start", async () => {
    if (done) return {};
    return { systemPrompt };
  });

  pi.on("agent_end", async () => {
    if (done) return;
    done = true;
    stopLoader();
    notify("Review saved → pi-review.md");
  });

  pi.sendUserMessage(userPrompt);
}

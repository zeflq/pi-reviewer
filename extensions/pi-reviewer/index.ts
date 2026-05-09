import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readVerbose, readMinSeverity, readModel, readThinking } from "../../src/core/ui/server/index.js";
import { parseArgs } from "./args.js";
import { resolveCurrentModelId } from "./model.js";
import { handleDryRun } from "./handlers/dry-run.js";
import { handleLocalReview } from "./handlers/local.js";
import { handleSSHReview } from "./handlers/ssh.js";
import type { CommonHandlerOptions, ModelInfo } from "./handlers/types.js";

export { buildSSHSource } from "./handlers/ssh.js";

function resolveCommonOpts(
  parsed: ReturnType<typeof parseArgs>,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  notify: CommonHandlerOptions["notify"],
  loaderState: { stop: () => void },
): CommonHandlerOptions {
  const minSeverity = parsed.minSeverity ?? readMinSeverity();
  const verbose = parsed.verbose ?? readVerbose();
  const model = parsed.model ?? readModel();
  const thinking = parsed.thinking ?? readThinking();
  const defaultModel = readModel();
  const availableModels: ModelInfo[] = ctx.modelRegistry.getAvailable().map((m) => ({
    id: m.id as string,
    name: (m.name ?? m.id) as string,
    provider: m.provider as string,
  }));
  const sessionModel = ctx.model ? { id: ctx.model.id as string, provider: ctx.model.provider as string } : undefined;
  const currentModelId = resolveCurrentModelId(model, availableModels, sessionModel);
  const defaultThinking = readThinking();
  return { pi, loaderState, notify, minSeverity, verbose, model, thinking, currentModelId, defaultModel, availableModels, defaultThinking };
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("review", {
    description: "Review a PR diff with pi-reviewer (flags: --diff, --branch, --pr, --ssh, --ui, --dry-run)",
    async handler(args, ctx) {
      const notify = ctx.ui.notify.bind(ctx.ui);
      const loaderState = { stop: () => {} };
      let sshMode = false;
      try {
        const parsed = parseArgs(args);
        sshMode = parsed.ssh;
        const common = resolveCommonOpts(parsed, ctx, pi, notify, loaderState);

        if (parsed.dryRun) return void (await handleDryRun({ parsed, cwd: ctx.cwd, ...common }));
        if (parsed.ssh)    return void (await handleSSHReview({ parsed, ctx, ...common }));
                           return void (await handleLocalReview({ parsed, ctx, ...common }));
      } catch (error) {
        loaderState.stop();
        const message = error instanceof Error ? error.message : String(error);
        const hint = !sshMode && message.includes("not a git repository")
          ? "\n\nNot in a git repository — if you're in an SSH session, try adding --ssh."
          : "";
        notify(`Review failed: ${message}${hint}`, "error");
      }
    },
  });
}

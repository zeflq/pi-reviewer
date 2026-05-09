import { readVerbose, readMinSeverity, readModel, readThinking } from "../../src/core/ui/server/index.js";
import { parseArgs } from "./args.js";
import { resolveCurrentModelId } from "./model.js";
import { handleDryRun } from "./handlers/dry-run.js";
import { handleLocalReview } from "./handlers/local.js";
import { handleSSHReview } from "./handlers/ssh.js";
export { buildSSHSource } from "./handlers/ssh.js";
function resolveCommonOpts(parsed, ctx, pi, notify, loaderState) {
    const minSeverity = parsed.minSeverity ?? readMinSeverity();
    const verbose = parsed.verbose ?? readVerbose();
    const model = parsed.model ?? readModel();
    const thinking = parsed.thinking ?? readThinking();
    const defaultModel = readModel();
    const availableModels = ctx.modelRegistry.getAvailable().map((m) => ({
        id: m.id,
        name: (m.name ?? m.id),
        provider: m.provider,
    }));
    const sessionModel = ctx.model ? { id: ctx.model.id, provider: ctx.model.provider } : undefined;
    const currentModelId = resolveCurrentModelId(model, availableModels, sessionModel);
    const defaultThinking = readThinking();
    return { pi, loaderState, notify, minSeverity, verbose, model, thinking, currentModelId, defaultModel, availableModels, defaultThinking };
}
export default function (pi) {
    pi.registerCommand("review", {
        description: "Review a PR diff with pi-reviewer (flags: --diff, --branch, --pr, --ssh, --ui, --dry-run)",
        async handler(args, ctx) {
            const notify = ctx.ui.notify.bind(ctx.ui);
            const loaderState = { stop: () => { } };
            let sshMode = false;
            try {
                const parsed = parseArgs(args);
                sshMode = parsed.ssh;
                const common = resolveCommonOpts(parsed, ctx, pi, notify, loaderState);
                if (parsed.dryRun)
                    return void (await handleDryRun({ parsed, cwd: ctx.cwd, ...common }));
                if (parsed.ssh)
                    return void (await handleSSHReview({ parsed, ctx, ...common }));
                return void (await handleLocalReview({ parsed, ctx, ...common }));
            }
            catch (error) {
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

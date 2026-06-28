import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function setReviewFooter(ctx: ExtensionContext, source: string, opts?: { model?: string; thinking?: string }): () => void {
  let spinnerIndex = 0;
  let spinnerTimer: ReturnType<typeof setInterval> | undefined;

  ctx.ui.setFooter((tui, theme, footerData) => {
    const unsub = footerData.onBranchChange(() => tui.requestRender());

    spinnerTimer = setInterval(() => {
      spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length;
      tui.requestRender();
    }, 80);

    return {
      dispose() {
        unsub();
        if (spinnerTimer) clearInterval(spinnerTimer);
      },
      invalidate() {},
      render(width: number): string[] {
        const spinner = theme.fg("accent", SPINNER_FRAMES[spinnerIndex]);
        const label = theme.fg("dim", ` Reviewing ${source}`);
        const statusMap = footerData.getExtensionStatuses();
        const statuses = [...statusMap.entries()]
          .filter(([key]) => key !== "pi-reviewer")
          .map(([, text]) => text)
          .join("  ");
        const modelParts: string[] = [];
        if (opts?.model) modelParts.push(opts.model.split("/").pop() ?? opts.model);
        if (opts?.thinking) modelParts.push(opts.thinking);
        const modelTag = modelParts.length ? theme.fg("dim", modelParts.join(" · ")) : "";
        const right = [modelTag, statuses ? theme.fg("dim", statuses) : ""].filter(Boolean).join("  ");
        const left = spinner + label;
        const pad = right
          ? " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)))
          : "";
        return [truncateToWidth(left + pad + right, width)];
      },
    };
  });

  return () => ctx.ui.setFooter(undefined);
}

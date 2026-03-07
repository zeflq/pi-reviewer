import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function setReviewFooter(ctx: ExtensionContext, source: string): () => void {
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
        const right = statuses ? theme.fg("dim", statuses) : "";
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

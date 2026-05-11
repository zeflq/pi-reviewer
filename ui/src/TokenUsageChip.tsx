import type { TokenUsage } from "./types";

function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.001) return "<$0.001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface TokenUsageChipProps {
  usage: TokenUsage;
}

export function TokenUsageChip({ usage }: TokenUsageChipProps) {
  const tooltip = `${formatTokens(usage.inputTokens)} in · ${formatTokens(usage.outputTokens)} out · ${formatTokens(usage.cacheReadTokens)} cache read`;
  return (
    <span className="meta-chip token-cost" data-tooltip={tooltip}>
      {formatTokens(usage.totalTokens)} tok · {formatCost(usage.cost)}
    </span>
  );
}

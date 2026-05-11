import { TokenUsageChip } from "./TokenUsageChip";
import type { TokenUsage } from "../../types";

interface HeaderSourceProps {
  source?: string;
  ssh?: boolean;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  currentModel?: string;
  currentThinking?: string;
  tokenUsage?: TokenUsage;
}

export function HeaderSource({ source, ssh, sidebarOpen, onSidebarToggle, currentModel, currentThinking, tokenUsage }: HeaderSourceProps) {
  const reviewedByParts = [currentModel?.split("/").pop(), currentThinking].filter(Boolean);
  const reviewedByLabel = reviewedByParts.length ? reviewedByParts.join(" · ") : undefined;

  return (
    <>
      <button className="icon-btn" onClick={onSidebarToggle} data-tooltip={sidebarOpen ? "Hide file sidebar" : "Show file sidebar"}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
          {sidebarOpen
            ? <polyline points="10 9 7 12 10 15"/>
            : <polyline points="7 9 10 12 7 15"/>}
        </svg>
      </button>
      <span id="hdr2-sep" />
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, overflow: "hidden", minWidth: 0 }}>
        <span id="hdr2-source">{source ? (ssh ? `SSH · ${source}` : source) : ""}</span>
        {reviewedByLabel && (
          <span className="meta-chip reviewed-by" data-tooltip={[currentModel, currentThinking].filter(Boolean).join(" · ")}>
            {reviewedByLabel}
          </span>
        )}
        {tokenUsage && <TokenUsageChip usage={tokenUsage} />}
      </div>
    </>
  );
}

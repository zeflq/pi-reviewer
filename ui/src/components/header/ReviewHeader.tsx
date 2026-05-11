import { HeaderBrand } from "./HeaderBrand";
import { HeaderSource } from "./HeaderSource";
import { HeaderProgress } from "./HeaderProgress";
import { HeaderActions } from "./HeaderActions";
import type { TokenUsage } from "../../types";

interface ReviewHeaderProps {
  source?: string;
  ssh?: boolean;
  theme: "dark" | "light";
  onThemeToggle: () => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  currentModel?: string;
  currentThinking?: string;
  tokenUsage?: TokenUsage;
  severityCounts?: Record<string, number>;
  decidedCount: number;
  totalComments: number;
  allDone: boolean;
  hasAccepted: boolean;
  onJumpToNext: () => void;
  onAction: (type: string, globalComment: string) => void;
  allCollapsed: boolean;
  onToggleCollapse: () => void;
  onSummaryToggle: () => void;
  onContextToggle: () => void;
  contextCount?: number;
}

export function ReviewHeader(props: ReviewHeaderProps) {
  const { theme, onThemeToggle, source, ssh, sidebarOpen, onSidebarToggle, currentModel, currentThinking, tokenUsage, severityCounts, decidedCount, totalComments, allDone, hasAccepted, onJumpToNext, onAction, allCollapsed, onToggleCollapse, onSummaryToggle, onContextToggle, contextCount } = props;

  return (
    <div id="sticky-top">
      <HeaderBrand theme={theme} onThemeToggle={onThemeToggle} />
      <div id="hdr2">
        <HeaderSource source={source} ssh={ssh} sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} currentModel={currentModel} currentThinking={currentThinking} tokenUsage={tokenUsage} />
        <HeaderProgress severityCounts={severityCounts} decidedCount={decidedCount} totalComments={totalComments} allDone={allDone} onJumpToNext={onJumpToNext} />
        <HeaderActions allDone={allDone} hasAccepted={hasAccepted} onAction={onAction} allCollapsed={allCollapsed} onToggleCollapse={onToggleCollapse} onSummaryToggle={onSummaryToggle} onContextToggle={onContextToggle} contextCount={contextCount} />
      </div>
    </div>
  );
}

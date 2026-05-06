import type { MinSeverity } from "../../prompt-builder.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface PiReviewerConfig {
  theme?: "dark" | "light";
  viewMode?: "split" | "unified";
  verbose?: boolean;
  minSeverity?: MinSeverity;
  model?: string;
  thinking?: ThinkingLevel;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface UIModelConfig {
  currentModel?: string;
  currentThinking?: string;
  defaultModel?: string;
  availableModels?: ModelInfo[];
  defaultThinking?: string;
}

export type ActionType = "send" | "save" | "save-and-send" | "closed";

export interface CommentDecision {
  index: number;
  decision: "accept" | "reject" | "discuss";
  discussText?: string;
}

export interface UIAction {
  type: ActionType;
  decisions: CommentDecision[];
  globalComment?: string;
}

export interface UIServerHandle {
  url: string;
  waitForAction: () => Promise<UIAction>;
  close: () => Promise<void>;
}

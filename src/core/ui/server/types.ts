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
  autoCollapseViewed?: boolean;
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

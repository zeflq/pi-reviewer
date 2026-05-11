export interface ContextFile {
  path: string;
  content: string;
}

export interface ContextGroup {
  name: string;
  files: ContextFile[];
}

export interface ReviewComment {
  file: string;
  line: number;
  severity: string;
  body: string;
  side?: "LEFT" | "RIGHT";
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  cost: number;
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
  tokenUsage?: TokenUsage;
}

export interface CommentDecision {
  index: number;
  decision: "accept" | "reject" | "discuss";
  discussText?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface UIData {
  result: ReviewResult;
  diff: string;
  source?: string;
  ssh?: boolean;
  theme?: "dark" | "light";
  viewMode?: "split" | "unified";
  currentModel?: string;
  currentThinking?: string;
  defaultModel?: string;
  availableModels?: ModelInfo[];
  defaultThinking?: string;
  autoCollapseViewed?: boolean;
  contextGroups?: ContextGroup[];
}

export interface ReviewComment {
  file: string;
  line: number;
  severity: string;
  body: string;
  side?: "LEFT" | "RIGHT";
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
}

export interface CommentDecision {
  index: number;
  decision: "accept" | "reject" | "discuss";
  discussText?: string;
}

export interface UIData {
  result: ReviewResult;
  diff: string;
  source?: string;
  ssh?: boolean;
}

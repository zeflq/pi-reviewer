import { describe, expect, it } from "vitest";

/**
 * Reproduces the allDone logic from App.tsx exactly.
 * Bug: totalComments counts ALL AI comments, but only comments whose `file`
 * matches a parsed diff file are ever rendered — orphan comments can never be
 * decided, so allDone === false even when every visible comment is decided.
 */
function computeAllDone(
  totalComments: number,
  decisions: Record<number, { decision: string }>,
): boolean {
  const decidedCount = Object.values(decisions).filter((d) => d.decision).length;
  return totalComments > 0 && decidedCount === totalComments;
}

const DIFF_FILES = new Set(["src/auth.ts", "src/utils.ts"]);

const COMMENTS = [
  { file: "src/auth.ts", line: 10, body: "use const" },       // idx 0 — renderable
  { file: "src/utils.ts", line: 5, body: "missing check" },   // idx 1 — renderable
  { file: "src/ghost.ts", line: 3, body: "orphan comment" },  // idx 2 — NOT in diff → orphan
];

function renderableIndices(comments: Array<{ file: string }>, diffFiles: Set<string>): number[] {
  return comments.map((c, i) => ({ file: c.file, i }))
    .filter(({ file }) => diffFiles.has(file))
    .map(({ i }) => i);
}

describe("allDone — orphan comment bug", () => {
  it("allDone is true when all renderable comments are decided (no orphans)", () => {
    const comments = COMMENTS.slice(0, 2); // no orphan
    const decisions: Record<number, { decision: string }> = {
      0: { decision: "accept" },
      1: { decision: "reject" },
    };

    const result = computeAllDone(comments.length, decisions);

    expect(result).toBe(true);
  });

  it("allDone is true only after orphan comments are also decided", () => {
    // Orphan comments (file not in diff) are rendered by OrphanComments with a
    // clear label so the user must explicitly accept/reject them before finishing.
    const renderable = renderableIndices(COMMENTS, DIFF_FILES); // [0, 1]

    // Deciding only the diff-file comments is not enough — orphan still pending.
    const partialDecisions: Record<number, { decision: string }> = {};
    for (const i of renderable) partialDecisions[i] = { decision: "accept" };
    expect(computeAllDone(COMMENTS.length, partialDecisions)).toBe(false);

    // Once the user also dismisses the orphan, allDone becomes true.
    const allDecisions = { ...partialDecisions, 2: { decision: "reject" } };
    expect(computeAllDone(COMMENTS.length, allDecisions)).toBe(true);
  });
});

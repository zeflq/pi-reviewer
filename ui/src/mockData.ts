import type { UIData } from "./types";

export const mockData: UIData = {
  result: {
    summary:
      "Overall the changes look solid. A few minor issues around error handling and one potential security concern worth addressing before merge.",
    comments: [
      {
        file: "src/core/output.ts",
        line: 42,
        side: "RIGHT",
        severity: "CRITICAL",
        body: "Input is not sanitised before being passed to the shell. An attacker-controlled value could lead to command injection.",
      },
      {
        file: "src/core/context.ts",
        line: 22,
        side: "RIGHT",
        severity: "WARN",
        body: "`readdir` failure is swallowed silently. Consider logging at debug level so CI traces are easier to read.",
      },
      {
        file: "src/core/context.ts",
        line: 12,
        side: "LEFT",
        severity: "INFO",
        body: "This import was removed — double-check nothing else depended on it.",
      },
    ],
  },
  diff: `diff --git a/src/core/context.ts b/src/core/context.ts
index abc1234..def5678 100644
--- a/src/core/context.ts
+++ b/src/core/context.ts
@@ -10,13 +10,14 @@
 import { readFile } from "node:fs/promises";
 import path from "node:path";
-import { legacyHelper } from "./legacy.js";

 export interface ContextResult {
   conventions: string;
   reviewRules: string;
+  loadedFiles?: string[];
 }

 async function findFileCaseInsensitive(dir: string, name: string) {
+  // cross-platform case-insensitive lookup
   try {
-    const entries = await readdir(dir);
+    const entries = await readdir(dir).catch(() => []);
     return entries.find((e) => e.toLowerCase() === name.toLowerCase());
diff --git a/src/core/output.ts b/src/core/output.ts
index 111aaaa..222bbbb 100644
--- a/src/core/output.ts
+++ b/src/core/output.ts
@@ -38,6 +38,10 @@

 export function parseAgentResponse(raw: string, minSeverity?: MinSeverity): ReviewResult {
   const parsed = tryParseJSON(raw);
+  if (!parsed) return { summary: raw, comments: [] };
+  const comments = Array.isArray(parsed.comments)
+    ? (parsed.comments as unknown[]).filter(isReviewComment)
+    : [];
   return {
     summary: typeof parsed?.summary === "string" ? parsed.summary : raw,
-    comments: [],
+    comments,
   };
 }
`,
};

/**
 * Dev script: skips the review agent and boots the UI server directly with
 * a hardcoded ReviewResult + synthetic diff. Run with: npm run dev:ui
 */
import { startUIServer } from "../core/ui-server.js";
import type { ReviewResult } from "../core/output.js";

const mockResult: ReviewResult = {
  summary:
    "Overall the changes look solid. A few minor issues around error handling and one potential security concern worth addressing before merge.",
  comments: [
    {
      file: "src/core/output.ts",
      line: 42,
      side: "RIGHT",
      severity: "CRITICAL",
      body: "🔴 Input is not sanitised before being passed to the shell. An attacker-controlled value could lead to command injection.",
    },
    {
      file: "src/core/context.ts",
      line: 18,
      side: "RIGHT",
      severity: "WARN",
      body: "🟡 `readdir` failure is swallowed silently. Consider logging at debug level so CI traces are easier to read.",
    },
    {
      file: "src/core/context.ts",
      line: 12,
      side: "LEFT",
      severity: "INFO",
      body: "🔵 This import was removed — double-check nothing else depended on it.",
    },
  ],
};

// Minimal synthetic diff that matches the files referenced by the mock comments
const mockDiff = `diff --git a/src/core/context.ts b/src/core/context.ts
index abc1234..def5678 100644
--- a/src/core/context.ts
+++ b/src/core/context.ts
@@ -10,8 +10,10 @@
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
`;

const handle = await startUIServer(mockResult, mockDiff);
console.log("[dev:ui] server started →", handle.url);
console.log("[dev:ui] press Ctrl+C to stop");

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { ReviewResult } from "../output.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateHtml = readFileSync(join(__dirname, "../../../dist-ui/index.html"), "utf-8");

export function buildHTML(result: ReviewResult, diff: string): string {
  const escaped = JSON.stringify({ result, diff })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return templateHtml.replace("/*%%DATA%%*/null/*%%END%%*/", escaped);
}

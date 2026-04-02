import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
export function buildHTML(result, diff, source, ssh, theme, viewMode) {
    const templateHtml = readFileSync(join(__dirname, "../../../dist-ui/index.html"), "utf-8");
    const escaped = JSON.stringify({ result, diff, source, ssh, theme, viewMode })
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");
    return templateHtml.replace("/*%%DATA%%*/null/*%%END%%*/", () => escaped);
}

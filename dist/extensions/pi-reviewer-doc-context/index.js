import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONTEXT_PROVIDER_EVENT = "pi-reviewer:collect-context-providers";
const CONFIG_FILE = join(homedir(), ".pi", "pi-reviewer-doc-context", "config.json");
function readDocDirs() {
    try {
        const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
        if (Array.isArray(config.docDirs) && config.docDirs.every((d) => typeof d === "string")) {
            return config.docDirs;
        }
    }
    catch { /* ignore */ }
    return [".pi/notes", ".claude/notes", ".agents/notes"];
}
export function extractKeywords(diffFiles) {
    const keywords = new Set();
    for (const file of diffFiles) {
        const withoutExt = file.replace(/\.[^/.]+$/, "");
        for (const segment of withoutExt.split(/[/\-_.]/)) {
            for (const word of segment.split(/(?=[A-Z])/)) {
                const lower = word.toLowerCase();
                if (lower.length >= 3)
                    keywords.add(lower);
            }
        }
    }
    return [...keywords];
}
export function parseDescription(content) {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match)
        return null;
    const descMatch = match[1].match(/^description:\s*(.+)$/m);
    return descMatch ? descMatch[1].trim() : null;
}
export function isRelevant(description, filePath, keywords) {
    const haystack = `${description} ${filePath}`.toLowerCase();
    return keywords.some(kw => haystack.includes(kw));
}
async function scanDocFiles(cwd, fs, docDirs) {
    const results = [];
    async function scanDir(absDir, relDir, depth) {
        let entries;
        try {
            entries = await fs.list(absDir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (entry.endsWith(".md")) {
                const content = await fs.read(fs.join(absDir, entry));
                if (!content)
                    continue;
                const description = parseDescription(content);
                if (!description)
                    continue;
                results.push({ path: fs.join(relDir, entry), content, description });
            }
            else if (depth < 1) {
                await scanDir(fs.join(absDir, entry), fs.join(relDir, entry), depth + 1);
            }
        }
    }
    for (const dir of docDirs) {
        await scanDir(fs.join(cwd, dir), dir, 0);
    }
    return results;
}
export default function (pi) {
    pi.events.on(CONTEXT_PROVIDER_EVENT, (data) => {
        const { register } = data;
        register("doc-context", async ({ cwd, diffFiles, fs }) => {
            const keywords = extractKeywords(diffFiles);
            if (keywords.length === 0)
                return [];
            const docDirs = readDocDirs();
            const docs = await scanDocFiles(cwd, fs, docDirs);
            return docs
                .filter(doc => isRelevant(doc.description, doc.path, keywords))
                .map(doc => ({ path: doc.path, content: doc.content }));
        });
    });
}

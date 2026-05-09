import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const CONTEXT_PROVIDER_EVENT = "pi-reviewer:collect-context-providers";

const CONFIG_FILE = join(homedir(), ".pi", "pi-reviewer-doc-context", "config.json");

interface Fs {
  read: (path: string) => Promise<string | null>;
  list: (path: string) => Promise<string[]>;
  join: (...parts: string[]) => string;
}

interface ContextFile {
  path: string;
  content: string;
}

interface ContextProviderEvent {
  cwd: string;
  diffFiles: string[];
  register: (name: string, provider: (opts: { cwd: string; diffFiles: string[]; fs: Fs }) => Promise<ContextFile[]>) => void;
}

function readDocDirs(): string[] {
  try {
    const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as { docDirs?: unknown };
    if (Array.isArray(config.docDirs) && config.docDirs.every((d) => typeof d === "string")) {
      return config.docDirs as string[];
    }
  } catch { /* ignore */ }
  return [".pi/notes", ".claude/notes", ".agents/notes"];
}

export function extractKeywords(diffFiles: string[]): string[] {
  const keywords = new Set<string>();
  for (const file of diffFiles) {
    const withoutExt = file.replace(/\.[^/.]+$/, "");
    for (const segment of withoutExt.split(/[/\-_.]/)) {
      for (const word of segment.split(/(?=[A-Z])/)) {
        const lower = word.toLowerCase();
        if (lower.length >= 3) keywords.add(lower);
      }
    }
  }
  return [...keywords];
}

export function parseDescription(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const descMatch = match[1].match(/^description:\s*(.+)$/m);
  return descMatch ? descMatch[1].trim() : null;
}

export function isRelevant(description: string, filePath: string, keywords: string[]): boolean {
  const haystack = `${description} ${filePath}`.toLowerCase();
  return keywords.some(kw => haystack.includes(kw));
}

async function scanDocFiles(
  cwd: string,
  fs: Fs,
  docDirs: string[],
): Promise<Array<{ path: string; content: string; description: string }>> {
  const results: Array<{ path: string; content: string; description: string }> = [];

  async function scanDir(absDir: string, relDir: string, depth: number): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.list(absDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.endsWith(".md")) {
        const content = await fs.read(fs.join(absDir, entry));
        if (!content) continue;
        const description = parseDescription(content);
        if (!description) continue;
        results.push({ path: fs.join(relDir, entry), content, description });
      } else if (depth < 1) {
        await scanDir(fs.join(absDir, entry), fs.join(relDir, entry), depth + 1);
      }
    }
  }

  for (const dir of docDirs) {
    await scanDir(fs.join(cwd, dir), dir, 0);
  }
  return results;
}

export default function (pi: ExtensionAPI): void {
  pi.events.on(CONTEXT_PROVIDER_EVENT, (data: unknown) => {
    const { register } = data as ContextProviderEvent;
    register("doc-context", async ({ cwd, diffFiles, fs }): Promise<ContextFile[]> => {
      const keywords = extractKeywords(diffFiles);
      if (keywords.length === 0) return [];
      const docDirs = readDocDirs();
      const docs = await scanDocFiles(cwd, fs, docDirs);
      return docs
        .filter(doc => isRelevant(doc.description, doc.path, keywords))
        .map(doc => ({ path: doc.path, content: doc.content }));
    });
  });
}

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MinSeverity } from "./prompt-builder.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface PiReviewerConfig {
  theme?: "dark" | "light";
  viewMode?: "split" | "unified";
  verbose?: boolean;
  minSeverity?: MinSeverity;
  model?: string;
  thinking?: ThinkingLevel;
  autoCollapseViewed?: boolean;
  defaultBranch?: string;
}

export const CONFIG_DIR = join(homedir(), ".pi", "pi-reviewer");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function readConfig(): PiReviewerConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as PiReviewerConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: PiReviewerConfig): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch { /* ignore */ }
}

const VALID: { [K in keyof PiReviewerConfig]?: readonly string[] } = {
  theme: ["dark", "light"],
  viewMode: ["split", "unified"],
  thinking: ["off", "minimal", "low", "medium", "high", "xhigh"],
  minSeverity: ["INFO", "WARN", "CRITICAL"],
};

export function applyConfigPatch(patch: Partial<PiReviewerConfig>): void {
  const next = { ...readConfig() };
  for (const key of Object.keys(patch) as (keyof PiReviewerConfig)[]) {
    const value = patch[key];
    const allowed = VALID[key];
    if (allowed) {
      if (typeof value === "string" && allowed.includes(value)) (next as Record<string, unknown>)[key] = value;
    } else if (key === "defaultBranch") {
      if (typeof value === "string") next.defaultBranch = value || undefined;
    } else if (typeof value === "string" || typeof value === "boolean") {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  saveConfig(next);
}

export function readTheme(): "dark" | "light" { return readConfig().theme ?? "dark"; }
export function readViewMode(): "split" | "unified" { return readConfig().viewMode ?? "split"; }
export function readVerbose(): boolean { return readConfig().verbose ?? false; }
export function readMinSeverity(): MinSeverity { return readConfig().minSeverity ?? "INFO"; }
export function readModel(): string | undefined { return readConfig().model; }
export function readThinking(): string | undefined { return readConfig().thinking as ThinkingLevel | undefined; }
export function readAutoCollapseViewed(): boolean { return readConfig().autoCollapseViewed ?? false; }
export function readDefaultBranch(): string | undefined { return readConfig().defaultBranch; }

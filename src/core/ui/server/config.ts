import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MinSeverity } from "../../prompt-builder.js";
import type { PiReviewerConfig, ThinkingLevel } from "./types.js";

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

export function readTheme(): "dark" | "light" {
  return readConfig().theme ?? "dark";
}

export function readViewMode(): "split" | "unified" {
  return readConfig().viewMode ?? "split";
}

export function readVerbose(): boolean {
  return readConfig().verbose ?? false;
}

export function readMinSeverity(): MinSeverity {
  return readConfig().minSeverity ?? "INFO";
}

export function readModel(): string | undefined {
  return readConfig().model;
}

export function readThinking(): string | undefined {
  return readConfig().thinking as ThinkingLevel | undefined;
}

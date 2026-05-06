import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
export const CONFIG_DIR = join(homedir(), ".pi", "pi-reviewer");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export function readConfig() {
    try {
        return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }
    catch {
        return {};
    }
}
export function saveConfig(config) {
    try {
        mkdirSync(CONFIG_DIR, { recursive: true });
        writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    }
    catch { /* ignore */ }
}
export function readTheme() {
    return readConfig().theme ?? "dark";
}
export function readViewMode() {
    return readConfig().viewMode ?? "split";
}
export function readVerbose() {
    return readConfig().verbose ?? false;
}
export function readMinSeverity() {
    return readConfig().minSeverity ?? "INFO";
}
export function readModel() {
    return readConfig().model;
}
export function readAutoCollapseViewed() {
    return readConfig().autoCollapseViewed ?? false;
}
export function readThinking() {
    return readConfig().thinking;
}

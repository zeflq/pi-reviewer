import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { exec } from "node:child_process";
import { platform, homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ReviewResult } from "../output.js";
import { buildHTML } from "./template.js";

const CONFIG_DIR = join(homedir(), ".pi", "pi-reviewer");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface PiReviewerConfig {
  theme?: "dark" | "light";
  viewMode?: "split" | "unified";
}

function readConfig(): PiReviewerConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as PiReviewerConfig;
  } catch {
    return {};
  }
}

function saveConfig(config: PiReviewerConfig): void {
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

export type ActionType = "send" | "save" | "save-and-send" | "closed";

export interface CommentDecision {
  index: number;
  decision: "accept" | "reject" | "discuss";
  discussText?: string;
}

export interface UIAction {
  type: ActionType;
  decisions: CommentDecision[];
  globalComment?: string;
}

export interface UIServerHandle {
  url: string;
  waitForAction: () => Promise<UIAction>;
  close: () => Promise<void>;
}

// Resolve if no ping received for this long — user closed the tab.
// Set high enough to survive browser background tab throttling (browsers can
// suspend setInterval to ~1 min when the tab is in the background).
const HEARTBEAT_MS = 120_000; // 2 minutes

export async function startUIServer(result: ReviewResult, diff: string, source?: string, ssh?: boolean): Promise<UIServerHandle> {
  const html = buildHTML(result, diff, source, ssh, readTheme(), readViewMode());

  let resolveAction!: (a: UIAction) => void;
  const actionPromise = new Promise<UIAction>((r) => { resolveAction = r; });
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let resolved = false;

  function resolveOnce(action: UIAction) {
    if (resolved) return;
    resolved = true;
    clearTimeout(heartbeatTimer);
    resolveAction(action);
  }

  function resetHeartbeat() {
    if (resolved) return;
    clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(
      () => resolveOnce({ type: "closed", decisions: [] }),
      HEARTBEAT_MS
    );
  }

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => res(body));
    });
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } else if (req.method === "GET" && req.url === "/ping") {
      resetHeartbeat();
      res.writeHead(204);
      res.end();
    } else if (req.method === "POST" && req.url === "/theme") {
      const body = await readBody(req);
      try {
        const { theme } = JSON.parse(body) as { theme?: string };
        if (theme === "dark" || theme === "light") saveConfig({ ...readConfig(), theme });
      } catch { /* ignore */ }
      res.writeHead(204);
      res.end();
    } else if (req.method === "POST" && req.url === "/viewmode") {
      const body = await readBody(req);
      try {
        const { viewMode } = JSON.parse(body) as { viewMode?: string };
        if (viewMode === "split" || viewMode === "unified") saveConfig({ ...readConfig(), viewMode });
      } catch { /* ignore */ }
      res.writeHead(204);
      res.end();
    } else if (req.method === "POST" && req.url === "/action") {
      const body = await readBody(req);
      try {
        const action = JSON.parse(body) as UIAction;
        res.writeHead(200);
        res.end();
        resolveOnce(action);
      } catch {
        res.writeHead(400);
        res.end();
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const port = await listenOnRandomPort(server);
  const url = "http://localhost:" + port;
  openBrowser(url);

  return {
    url,
    waitForAction: () => actionPromise,
    close: () =>
      new Promise((resolve, reject) => {
        clearTimeout(heartbeatTimer);
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function listenOnRandomPort(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unexpected server address"));
        return;
      }
      resolve(addr.port);
    });
    server.on("error", reject);
  });
}

export function openBrowser(url: string): void {
  const p = platform();
  if (p === "darwin") exec("open " + url);
  else if (p === "win32") exec('start "" "' + url + '"');
  else exec("xdg-open " + url);
}

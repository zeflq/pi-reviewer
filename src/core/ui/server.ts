import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { exec } from "node:child_process";
import { platform } from "node:os";
import type { ReviewResult } from "../output.js";
import { buildHTML } from "./template.js";

export type ActionType = "send" | "save" | "save-and-send" | "closed";

export interface CommentDecision {
  index: number;
  decision: "accept" | "reject" | "discuss";
  discussText?: string;
}

export interface UIAction {
  type: ActionType;
  decisions: CommentDecision[];
}

export interface UIServerHandle {
  url: string;
  waitForAction: () => Promise<UIAction>;
  close: () => Promise<void>;
}

// Resolve if no ping received for this long — user closed the tab
const HEARTBEAT_MS = 6000;

export async function startUIServer(result: ReviewResult, diff: string, source?: string, ssh?: boolean): Promise<UIServerHandle> {
  const html = buildHTML(result, diff, source, ssh);

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

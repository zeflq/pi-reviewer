import type { IncomingMessage, ServerResponse } from "node:http";
import { readConfig, saveConfig } from "./config.js";
import type { PiReviewerConfig, ThinkingLevel, UIAction } from "./types.js";
import type { MinSeverity } from "../../prompt-builder.js";

const VALID_THINKING: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const VALID_SEVERITY: readonly MinSeverity[] = ["INFO", "WARN", "CRITICAL"];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let body = "";
    req.on("data", (c: Buffer) => { body += c; });
    req.on("end", () => res(body));
  });
}

function applyConfigPatch(patch: Partial<PiReviewerConfig>): void {
  const next = { ...readConfig() };
  if (patch.theme === "dark" || patch.theme === "light") next.theme = patch.theme;
  if (patch.viewMode === "split" || patch.viewMode === "unified") next.viewMode = patch.viewMode;
  if (typeof patch.model === "string") next.model = patch.model;
  if (typeof patch.autoCollapseViewed === "boolean") next.autoCollapseViewed = patch.autoCollapseViewed;
  if (typeof patch.verbose === "boolean") next.verbose = patch.verbose;
  if (typeof patch.thinking === "string" && (VALID_THINKING as string[]).includes(patch.thinking))
    next.thinking = patch.thinking as ThinkingLevel;
  if (typeof patch.minSeverity === "string" && (VALID_SEVERITY as string[]).includes(patch.minSeverity))
    next.minSeverity = patch.minSeverity as MinSeverity;
  saveConfig(next);
}

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

export function createRequestHandler(
  html: string,
  resolveOnce: (action: UIAction) => void,
  resetHeartbeat: () => void,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const routes: Record<string, RouteHandler> = {
    "GET /": (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    },
    "GET /ping": (_req, res) => {
      resetHeartbeat();
      res.writeHead(204);
      res.end();
    },
    "POST /config": async (req, res) => {
      const raw = await readBody(req);
      try { applyConfigPatch(JSON.parse(raw) as Partial<PiReviewerConfig>); } catch { /* ignore */ }
      res.writeHead(204);
      res.end();
    },
    "POST /action": async (req, res) => {
      const raw = await readBody(req);
      try {
        const action = JSON.parse(raw) as UIAction;
        res.writeHead(200);
        res.end();
        resolveOnce(action);
      } catch {
        res.writeHead(400);
        res.end();
      }
    },
  };

  return async (req, res) => {
    const key = `${req.method} ${req.url}`;
    const handler = routes[key];
    if (handler) await handler(req, res);
    else { res.writeHead(404); res.end(); }
  };
}

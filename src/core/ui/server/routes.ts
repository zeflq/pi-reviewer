import type { IncomingMessage, ServerResponse } from "node:http";
import { readConfig, saveConfig } from "./config.js";
import type { PiReviewerConfig, ThinkingLevel, UIAction } from "./types.js";

const VALID_THINKING: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let body = "";
    req.on("data", (c: Buffer) => { body += c; });
    req.on("end", () => res(body));
  });
}

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

function configRoute(extract: (parsed: unknown) => Partial<PiReviewerConfig> | undefined): RouteHandler {
  return async (req, res) => {
    const raw = await readBody(req);
    try {
      const patch = extract(JSON.parse(raw));
      if (patch) saveConfig({ ...readConfig(), ...patch });
    } catch { /* ignore */ }
    res.writeHead(204);
    res.end();
  };
}

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
    "POST /theme": configRoute((b) => {
      const { theme } = b as { theme?: string };
      return theme === "dark" || theme === "light" ? { theme } : undefined;
    }),
    "POST /viewmode": configRoute((b) => {
      const { viewMode } = b as { viewMode?: string };
      return viewMode === "split" || viewMode === "unified" ? { viewMode } : undefined;
    }),
    "POST /model": configRoute((b) => {
      const { model } = b as { model?: string };
      return typeof model === "string" ? { model } : undefined;
    }),
    "POST /thinking": configRoute((b) => {
      const { thinking } = b as { thinking?: string };
      return typeof thinking === "string" && (VALID_THINKING as string[]).includes(thinking)
        ? { thinking: thinking as ThinkingLevel }
        : undefined;
    }),
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

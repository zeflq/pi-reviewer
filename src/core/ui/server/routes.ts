import type { IncomingMessage, ServerResponse } from "node:http";
import { applyConfigPatch } from "../../config.js";
import type { PiReviewerConfig } from "../../config.js";
import type { UIAction } from "./types.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let body = "";
    req.on("data", (c: Buffer) => { body += c; });
    req.on("end", () => res(body));
  });
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

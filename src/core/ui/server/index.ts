import { createServer, type Server } from "node:http";
import { exec } from "node:child_process";
import { platform } from "node:os";
import type { ReviewResult } from "../../output.js";
import { buildHTML } from "../template.js";
import { readTheme, readViewMode, readAutoCollapseViewed } from "./config.js";
import { createRequestHandler } from "./routes.js";
import type { UIModelConfig, UIAction, UIServerHandle } from "./types.js";

export type { ModelInfo, UIModelConfig, ActionType, CommentDecision, UIAction, UIServerHandle } from "./types.js";
export { readTheme, readViewMode, readVerbose, readMinSeverity, readModel, readThinking } from "./config.js";

const HEARTBEAT_MS = 45_000;

export async function startUIServer(
  result: ReviewResult,
  diff: string,
  source?: string,
  ssh?: boolean,
  modelConfig?: UIModelConfig,
): Promise<UIServerHandle> {
  const html = buildHTML(result, diff, source, ssh, readTheme(), readViewMode(), {
    ...modelConfig,
    autoCollapseViewed: readAutoCollapseViewed(),
  });

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
      HEARTBEAT_MS,
    );
  }

  const handler = createRequestHandler(html, resolveOnce, resetHeartbeat);
  const server = createServer(handler);
  const port = await listenOnRandomPort(server);
  const url = "http://localhost:" + port;
  resetHeartbeat();
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

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { MinSeverity } from "../../../src/core/prompt-builder.js";
import type { ModelInfo } from "../../../src/core/ui-server.js";

export type { ModelInfo };

export interface CommonHandlerOptions {
  pi: ExtensionAPI;
  loaderState: { stop: () => void };
  notify: (msg: string, type?: "info" | "warning" | "error") => void;
  minSeverity: MinSeverity;
  verbose: boolean | undefined;
  model: string | undefined;
  thinking: string | undefined;
  currentModelId: string | undefined;
  defaultModel: string | undefined;
  availableModels: ModelInfo[];
  defaultThinking: string | undefined;
}

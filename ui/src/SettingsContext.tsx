import { createContext, useContext, useState, type ReactNode } from "react";
import type { ModelInfo } from "./types";

export interface Settings {
  viewMode: "split" | "unified";
  defaultModel?: string;
  defaultThinking?: string;
  autoCollapseViewed: boolean;
}

interface SettingsContextValue {
  settings: Settings;
  availableModels: ModelInfo[];
  patchSettings: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

interface SettingsProviderProps {
  initial: Settings;
  availableModels: ModelInfo[];
  children: ReactNode;
}

export function SettingsProvider({ initial, availableModels, children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<Settings>(initial);

  function patchSettings(patch: Partial<Settings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
    fetch("/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  return (
    <SettingsContext.Provider value={{ settings, availableModels, patchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

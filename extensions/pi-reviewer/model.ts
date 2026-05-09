export interface ModelEntry {
  id: string;
  name?: string;
  provider: string;
}

export function resolveCurrentModelId(
  model: string | undefined,
  availableModels: ModelEntry[],
  sessionModel: { id: string; provider: string } | undefined,
): string | undefined {
  const entry = model
    ? availableModels.find(m => m.id === model || `${m.provider}/${m.id}` === model)
    : sessionModel
    ? { id: sessionModel.id, provider: sessionModel.provider }
    : undefined;
  return entry ? `${entry.provider}/${entry.id}` : model;
}

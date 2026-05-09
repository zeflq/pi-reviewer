export function resolveCurrentModelId(model, availableModels, sessionModel) {
    const entry = model
        ? availableModels.find(m => m.id === model || `${m.provider}/${m.id}` === model)
        : sessionModel
            ? { id: sessionModel.id, provider: sessionModel.provider }
            : undefined;
    return entry ? `${entry.provider}/${entry.id}` : model;
}

import type { ContextGroup } from "../../types";

interface ContextGroupSelectorProps {
  groups: ContextGroup[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function ContextGroupSelector({ groups, selected, onChange }: ContextGroupSelectorProps) {
  if (groups.length === 0) return null;

  function toggle(name: string) {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
    );
  }

  return (
    <div className="submit-context">
      <div className="submit-context-label">Project context</div>
      {groups.map((g) => (
        <label key={g.name} className="submit-context-group">
          <input
            type="checkbox"
            checked={selected.includes(g.name)}
            onChange={() => toggle(g.name)}
          />
          <span className="submit-context-group-name">
            {g.name}
            {g.description && (
              <span className="info-icon" data-tooltip={g.description}>
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </span>
            )}
          </span>
          <span className="submit-context-group-count">{g.files.length} {g.files.length === 1 ? "file" : "files"}</span>
        </label>
      ))}
    </div>
  );
}

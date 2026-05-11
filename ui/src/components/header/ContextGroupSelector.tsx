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
          <span className="submit-context-group-name">{g.name}</span>
          <span className="submit-context-group-count">{g.files.length} {g.files.length === 1 ? "file" : "files"}</span>
        </label>
      ))}
    </div>
  );
}

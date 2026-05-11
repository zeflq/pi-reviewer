import { SidePanel } from "../sidebar/SidePanel";
import { ContextGroupSection } from "./ContextGroupSection";
import { countContextFiles } from "../../utils/context-panel-utils";
import type { ContextGroup } from "../../types";

interface Props {
  groups: ContextGroup[];
  onClose: () => void;
}

export function ContextPanel({ groups, onClose }: Props) {
  const total = countContextFiles(groups);
  return (
    <SidePanel title={`Context (${total} ${total === 1 ? "file" : "files"})`} onClose={onClose}>
      {groups.length === 0 ? (
        <p className="ctx-empty">No context files loaded.</p>
      ) : (
        groups.map(g => (
          <ContextGroupSection key={g.name} name={g.name} files={g.files} />
        ))
      )}
    </SidePanel>
  );
}

import { marked } from "marked";
import { SidePanel } from "../sidebar/SidePanel";

interface Props {
  summary: string;
  onClose: () => void;
}

export function SummaryPanel({ summary, onClose }: Props) {
  return (
    <SidePanel title="Overview" onClose={onClose}>
      <div className="summary-body md" dangerouslySetInnerHTML={{ __html: marked(summary) as string }} />
    </SidePanel>
  );
}

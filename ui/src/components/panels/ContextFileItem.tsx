import { useState } from "react";

interface Props {
  path: string;
  content: string;
}

export function ContextFileItem({ path, content }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="ctx-file-item">
      <button
        className="ctx-file-path"
        onClick={() => setExpanded(o => !o)}
        aria-expanded={expanded}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span>{path}</span>
      </button>
      {expanded && <pre className="ctx-file-content">{content}</pre>}
    </div>
  );
}

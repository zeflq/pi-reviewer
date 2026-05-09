import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function SidePanel({ title, onClose, children }: Props) {
  return (
    <>
      <div className="side-panel-hdr">
        <span className="side-panel-title">{title}</span>
        <button className="icon-btn" onClick={onClose} title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div className="side-panel-body">{children}</div>
    </>
  );
}

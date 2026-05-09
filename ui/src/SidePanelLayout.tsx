import type { ReactNode } from "react";

interface Props {
  side?: "left" | "right";
  children: ReactNode;
}

export function SidePanelLayout({ side = "right", children }: Props) {
  return <div className={`side-panel side-panel--${side}`}>{children}</div>;
}

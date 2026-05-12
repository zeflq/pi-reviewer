interface HeaderProgressProps {
  severityCounts?: Record<string, number>;
  decidedCount: number;
  totalComments: number;
  allDone: boolean;
  onJumpToNext: () => void;
}

export function HeaderProgress({ severityCounts, decidedCount, totalComments, allDone, onJumpToNext }: HeaderProgressProps) {
  return (
    <>
      {severityCounts && (
        <span className="sev-counts">
          {severityCounts["critical"] ? <span className="sev-pip"><span className="sev-dot sev-dot--critical" />{severityCounts["critical"]}</span> : null}
          {severityCounts["warn"] ? <span className="sev-pip"><span className="sev-dot sev-dot--warn" />{severityCounts["warn"]}</span> : null}
          {severityCounts["info"] ? <span className="sev-pip"><span className="sev-dot sev-dot--info" />{severityCounts["info"]}</span> : null}
        </span>
      )}
      <span id="hdr2-sep" />
      <span id="progress">{decidedCount} / {totalComments} <span style={{ color: "var(--text-muted)" }}>decided</span></span>
      <button className="icon-btn" disabled={allDone} onClick={onJumpToNext} data-tooltip="Jump to next undecided comment">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      </button>
    </>
  );
}

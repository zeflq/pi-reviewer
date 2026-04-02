import { useState } from "react";
import { ReviewComment } from "./types";
import { CommentCard } from "./CommentCard";

interface DecisionState {
  decision: string;
  discussText: string;
}

interface Props {
  comments: Array<{ comment: ReviewComment; idx: number }>;
  decisions: Record<number, DecisionState>;
  onDecide: (idx: number, decision: string, discussText: string) => void;
}

export function OrphanComments({ comments, decisions, onDecide }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (comments.length === 0) return null;

  const pendingCount = comments.filter(({ idx }) => !decisions[idx]?.decision).length;
  const badge = pendingCount > 0
    ? <span className="badge badge-pending">{pendingCount} pending</span>
    : <span className="badge badge-ok">all decided</span>;

  return (
    <div className="fblock fblock-orphan">
      <div className="fhdr" onClick={() => setCollapsed((c) => !c)} style={{ cursor: "pointer" }}>
        <span className="collapse-icon">{collapsed ? "▶" : "▼"}</span>
        <span className="fname fname-orphan">Comments on files not in diff</span>
        {badge}
      </div>
      {!collapsed && (
        <div className="orphan-list">
          {comments.map(({ comment, idx }) => (
            <CommentCard
              key={idx}
              comment={comment}
              idx={idx}
              decision={decisions[idx]?.decision}
              discussText={decisions[idx]?.discussText}
              onDecide={onDecide}
            />
          ))}
        </div>
      )}
    </div>
  );
}

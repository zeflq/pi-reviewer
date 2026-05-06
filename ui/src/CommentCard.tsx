import { useState } from "react";
import { ReviewComment } from "./types";
import { renderMarkdown } from "./renderMarkdown";

interface Props {
  comment: ReviewComment;
  idx: number;
  decision?: string;
  discussText?: string;
  onDecide: (idx: number, decision: string, discussText: string) => void;
  snapped?: boolean;
}

export function CommentCard({ comment, idx, decision, discussText = "", onDecide, snapped }: Props) {
  const sev = (comment.severity || "info").toLowerCase();
  const [pending, setPending] = useState(false);
  const [localText, setLocalText] = useState("");

  function openDiscuss() {
    setLocalText(discussText);
    setPending(true);
  }

  function confirmDiscuss() {
    if (!localText.trim()) return;
    onDecide(idx, "discuss", localText);
    setPending(false);
  }

  function cancelDiscuss() {
    setPending(false);
    setLocalText("");
  }

  const decisionLabel =
    decision === "accept" ? "✅ Accepted" :
    decision === "reject" ? "❌ Rejected" :
    decision === "discuss" ? "💬 Noted" : null;

  return (
    <div id={`cmt-${idx}`} className={`cc ${sev}${decision ? ` decided-${decision}` : " pending"}`}>
      <div className="cc-meta">
        {comment.file}:{comment.line}&nbsp;&nbsp;[{comment.severity}]
        {decisionLabel && <span className="cc-status">{decisionLabel}</span>}
      </div>
      <div className="cc-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }} />
      <div className="cc-actions">
        <button
          className={`dbtn${decision === "accept" ? " a-accept" : ""}`}
          title="Mark as accepted — will be included when sending findings to the agent"
          onClick={() => { setPending(false); onDecide(idx, "accept", ""); }}
        >
          ✅ Accept
        </button>
        <button
          className={`dbtn${decision === "reject" ? " a-reject" : ""}`}
          title="Dismiss this finding — it will be excluded from the agent message"
          onClick={() => { setPending(false); onDecide(idx, "reject", ""); }}
        >
          ❌ Reject
        </button>
        <button
          className={`dbtn${decision === "discuss" ? " a-discuss" : ""}`}
          title="Accept and add a personal note that will be sent alongside this finding"
          onClick={openDiscuss}
        >
          💬 Discuss
        </button>
        {snapped && (
          <span className="cc-snapped" title={`Agent referenced line ${comment.line} which is not shown in this diff`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/><polyline points="5 12 12 5 19 12"/></svg>
            not in diff
          </span>
        )}
      </div>
      {pending && (
        <div className="discuss-area">
          <textarea
            autoFocus
            placeholder="Your note..."
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
          />
          <div className="discuss-btns">
            <button className="dbtn a-discuss" disabled={!localText.trim()} onClick={confirmDiscuss}>Add</button>
            <button className="dbtn" onClick={cancelDiscuss}>Cancel</button>
          </div>
        </div>
      )}
      {!pending && decision === "discuss" && discussText && (
        <div className="discuss-preview" onClick={openDiscuss}>
          {discussText}
        </div>
      )}
    </div>
  );
}

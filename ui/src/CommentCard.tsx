import { useState } from "react";
import { ReviewComment } from "./types";

interface Props {
  comment: ReviewComment;
  idx: number;
  decision?: string;
  discussText?: string;
  onDecide: (idx: number, decision: string, discussText: string) => void;
}

export function CommentCard({ comment, idx, decision, discussText = "", onDecide }: Props) {
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

  return (
    <div className={`cc ${sev}`}>
      <div className="cc-meta">
        {comment.file}:{comment.line}&nbsp;&nbsp;[{comment.severity}]
      </div>
      <div className="cc-body">{comment.body}</div>
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

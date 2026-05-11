import { useState } from "react";

type SubmitMode = "send" | "save" | "save-and-send";

interface SubmitPanelProps {
  hasAccepted: boolean;
  onSubmit: (mode: SubmitMode, globalComment: string) => void;
  onClose: () => void;
}

export function SubmitPanel({ hasAccepted, onSubmit, onClose }: SubmitPanelProps) {
  const [submitMode, setSubmitMode] = useState<SubmitMode>(hasAccepted ? "send" : "save");
  const [globalComment, setGlobalComment] = useState("");

  function handleSubmit() {
    onSubmit(submitMode, globalComment);
  }

  return (
    <div className="submit-overlay" onClick={onClose}>
      <div className="submit-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Finish review</h2>

        <textarea
          className="submit-textarea"
          placeholder="Leave a global comment (optional)"
          value={globalComment}
          onChange={(e) => setGlobalComment(e.target.value)}
        />

        <div className="submit-radios">
          <label
            className="submit-radio"
            style={!hasAccepted ? { opacity: 0.4, pointerEvents: "none" } : undefined}
          >
            <input
              type="radio"
              name="submit-mode"
              value="send"
              checked={submitMode === "send"}
              onChange={() => setSubmitMode("send")}
              disabled={!hasAccepted}
            />
            <div>
              <div className="submit-radio-label">Send</div>
              <div className="submit-radio-desc">Inject accepted findings and start a new agent turn</div>
            </div>
          </label>

          <label className="submit-radio">
            <input
              type="radio"
              name="submit-mode"
              value="save"
              checked={submitMode === "save"}
              onChange={() => setSubmitMode("save")}
            />
            <div>
              <div className="submit-radio-label">Save</div>
              <div className="submit-radio-desc">Write review to pi-review.md</div>
            </div>
          </label>

          <label
            className="submit-radio"
            style={!hasAccepted ? { opacity: 0.4, pointerEvents: "none" } : undefined}
          >
            <input
              type="radio"
              name="submit-mode"
              value="save-and-send"
              checked={submitMode === "save-and-send"}
              onChange={() => setSubmitMode("save-and-send")}
              disabled={!hasAccepted}
            />
            <div>
              <div className="submit-radio-label">Save &amp; Send</div>
              <div className="submit-radio-desc">Write to pi-review.md and start a new agent turn</div>
            </div>
          </label>
        </div>

        {!hasAccepted && (
          <div className="submit-warning">
            All comments were rejected — accept or discuss at least one to enable Send.
          </div>
        )}

        <div className="submit-footer">
          <button className="action-btn" onClick={onClose} type="button">Cancel</button>
          <button className="finish-btn" onClick={handleSubmit} type="button">
            Finish review
          </button>
        </div>
      </div>
    </div>
  );
}

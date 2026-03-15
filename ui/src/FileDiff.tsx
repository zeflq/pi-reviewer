import { useState, useMemo } from "react";
import { ReviewComment } from "./types";
import { ParsedFile, SplitRow, buildSplitRows } from "./diff-parser";
import { CommentCard } from "./CommentCard";

const AUTO_COLLAPSE_THRESHOLD = 200;
const TRUNCATE_THRESHOLD = 300;

interface DecisionState {
  decision: string;
  discussText: string;
}

interface Props {
  file: ParsedFile;
  comments: Array<{ comment: ReviewComment; idx: number }>;
  decisions: Record<number, DecisionState>;
  onDecide: (idx: number, decision: string, discussText: string) => void;
}

function rowComments(
  fc: Array<{ comment: ReviewComment; idx: number }>,
  row: SplitRow
): Array<{ comment: ReviewComment; idx: number }> {
  return fc.filter(function (item) {
    const c = item.comment;
    if (row.type === "hunk") return false;
    if (row.type === "ctx") {
      if (c.side === "LEFT") return row.oln === c.line;
      return row.nln === c.line;
    }
    if (c.side === "LEFT") return row.del != null && row.del.ln === c.line;
    return row.add != null && row.add.ln === c.line;
  });
}

export function FileDiff({ file, comments: fc, decisions, onDecide }: Props) {
  const allRows = useMemo(() => buildSplitRows(file), [file]);
  const isLarge = allRows.length > AUTO_COLLAPSE_THRESHOLD;

  const [collapsed, setCollapsed] = useState(isLarge);
  const [showAll, setShowAll] = useState(false);

  const rows = showAll ? allRows : allRows.slice(0, TRUNCATE_THRESHOLD);
  const hidden = allRows.length - TRUNCATE_THRESHOLD;

  const badge =
    fc.length > 0 ? (
      <span className="cbadge">
        {fc.length} comment{fc.length !== 1 ? "s" : ""}
      </span>
    ) : null;

  const sizeBadge = isLarge ? (
    <span className="cbadge">{allRows.length} lines</span>
  ) : null;

  const trows: React.ReactNode[] = [];
  rows.forEach(function (row, ri) {
    if (row.type === "hunk") {
      trows.push(
        <tr key={`h${ri}`} className="hunk-hdr">
          <td colSpan={5}>{row.label}</td>
        </tr>
      );
      return;
    }

    const comments = rowComments(fc, row);
    const hasCmt = comments.length > 0;
    const trCls = hasCmt ? "has-comment" : "";

    if (row.type === "ctx") {
      trows.push(
        <tr key={`r${ri}`} className={trCls}>
          <td className="ln ln-ctx">{String(row.oln)}</td>
          <td className="code code-ctx">{row.content || "\u00a0"}</td>
          <td className="sep" />
          <td className="ln ln-ctx">{String(row.nln)}</td>
          <td className="code code-ctx">{row.content || "\u00a0"}</td>
        </tr>
      );
    } else {
      const d = row.del;
      const a = row.add;
      trows.push(
        <tr key={`r${ri}`} className={trCls}>
          <td className={`ln ${d ? "ln-del" : "ln-del-empty"}`}>{d ? String(d.ln) : ""}</td>
          <td className={`code ${d ? "code-del" : "code-del-empty"}`}>{d ? d.content || "\u00a0" : ""}</td>
          <td className="sep" />
          <td className={`ln ${a ? "ln-add" : "ln-add-empty"}`}>{a ? String(a.ln) : ""}</td>
          <td className={`code ${a ? "code-add" : "code-add-empty"}`}>{a ? a.content || "\u00a0" : ""}</td>
        </tr>
      );
    }

    if (hasCmt) {
      comments.forEach(function (item) {
        const dec = decisions[item.idx] || {};
        const isLeft = item.comment.side === "LEFT";
        const card = (
          <CommentCard
            comment={item.comment}
            idx={item.idx}
            decision={dec.decision}
            discussText={dec.discussText}
            onDecide={onDecide}
          />
        );
        trows.push(
          <tr key={`c${item.idx}`} className="cmt-row">
            {isLeft ? (
              <>
                <td colSpan={2} className="cmt-cell">{card}</td>
                <td className="sep" />
                <td colSpan={2} className="cmt-empty" />
              </>
            ) : (
              <>
                <td colSpan={2} className="cmt-empty" />
                <td className="sep" />
                <td colSpan={2} className="cmt-cell">{card}</td>
              </>
            )}
          </tr>
        );
      });
    }
  });

  return (
    <div className="fblock" id={`file-${CSS.escape(file.file)}`}>
      <div className="fhdr" onClick={() => setCollapsed((c) => !c)} style={{ cursor: "pointer" }}>
        <span className="collapse-icon">{collapsed ? "▶" : "▼"}</span>
        <span className="fname">{file.file}</span>
        {badge}
        {sizeBadge}
      </div>
      {!collapsed && (
        file.binary ? (
          <div className="bin-note">Binary file &mdash; diff not shown</div>
        ) : (
          <>
            <table className="diff-table">
              <colgroup>
                <col className="ln" />
                <col className="code" />
                <col className="sep" />
                <col className="ln" />
                <col className="code" />
              </colgroup>
              <tbody>{trows}</tbody>
            </table>
            {!showAll && hidden > 0 && (
              <button className="load-more" onClick={() => setShowAll(true)}>
                Load {hidden} more lines
              </button>
            )}
          </>
        )
      )}
    </div>
  );
}

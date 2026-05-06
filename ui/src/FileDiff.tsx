import { useState, useMemo, useEffect, useRef } from "react";
import { ReviewComment } from "./types";
import { ParsedFile, SplitRow, UnifiedRow, buildSplitRows, buildUnifiedRows } from "./diff-parser";
import { CommentCard } from "./CommentCard";
import { getLanguage, highlightLine } from "./highlight";
import { useSettings } from "./SettingsContext";

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
  selected?: boolean;
  forceOpen?: boolean;
  viewed?: boolean;
  onToggleViewed?: () => void;
  collapseSignal?: boolean;
}

type PlacedComment = { comment: ReviewComment; idx: number; snapped: boolean };
type PlacementMap = Map<number, PlacedComment[]>;

function buildSplitPlacements(
  fc: Array<{ comment: ReviewComment; idx: number }>,
  rows: SplitRow[]
): PlacementMap {
  const map: PlacementMap = new Map();
  for (const item of fc) {
    const c = item.comment;
    let exactIdx = -1;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (row.type === "hunk") continue;
      if (row.type === "ctx") {
        if (c.side === "LEFT" && row.oln === c.line) { exactIdx = ri; break; }
        if (c.side === "RIGHT" && row.nln === c.line) { exactIdx = ri; break; }
      } else {
        if (c.side === "LEFT" && row.del?.ln === c.line) { exactIdx = ri; break; }
        if (c.side === "RIGHT" && row.add?.ln === c.line) { exactIdx = ri; break; }
      }
    }
    if (exactIdx !== -1) {
      const arr = map.get(exactIdx) ?? []; arr.push({ ...item, snapped: false }); map.set(exactIdx, arr);
    } else {
      let bestIdx = -1, bestDist = Infinity;
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        if (row.type === "hunk") continue;
        const ln = c.side === "LEFT"
          ? (row.type === "ctx" ? row.oln : row.del?.ln)
          : (row.type === "ctx" ? row.nln : row.add?.ln);
        if (ln === undefined) continue;
        const dist = Math.abs(ln - c.line);
        if (dist < bestDist) { bestDist = dist; bestIdx = ri; }
      }
      if (bestIdx !== -1) {
        const arr = map.get(bestIdx) ?? []; arr.push({ ...item, snapped: true }); map.set(bestIdx, arr);
      }
    }
  }
  return map;
}

function buildUnifiedPlacements(
  fc: Array<{ comment: ReviewComment; idx: number }>,
  rows: UnifiedRow[]
): PlacementMap {
  const map: PlacementMap = new Map();
  for (const item of fc) {
    const c = item.comment;
    let exactIdx = -1;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (row.type === "hunk") continue;
      if (row.type === "del" && c.side === "LEFT" && row.oln === c.line) { exactIdx = ri; break; }
      if (row.type === "add" && c.side === "RIGHT" && row.nln === c.line) { exactIdx = ri; break; }
      if (row.type === "ctx") {
        if (c.side === "LEFT" && row.oln === c.line) { exactIdx = ri; break; }
        if (c.side === "RIGHT" && row.nln === c.line) { exactIdx = ri; break; }
      }
    }
    if (exactIdx !== -1) {
      const arr = map.get(exactIdx) ?? []; arr.push({ ...item, snapped: false }); map.set(exactIdx, arr);
    } else {
      let bestIdx = -1, bestDist = Infinity;
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        if (row.type === "hunk") continue;
        const ln = c.side === "LEFT" ? row.oln : row.nln;
        if (ln === undefined) continue;
        const dist = Math.abs(ln - c.line);
        if (dist < bestDist) { bestDist = dist; bestIdx = ri; }
      }
      if (bestIdx !== -1) {
        const arr = map.get(bestIdx) ?? []; arr.push({ ...item, snapped: true }); map.set(bestIdx, arr);
      }
    }
  }
  return map;
}

function hl(content: string | undefined, lang: string | null): React.ReactNode {
  if (!content) return "\u00a0";
  if (!lang) return content;
  return <span dangerouslySetInnerHTML={{ __html: highlightLine(content, lang) }} />;
}

export function FileDiff({ file, comments: fc, decisions, onDecide, selected, forceOpen, viewed, onToggleViewed, collapseSignal }: Props) {
  const { settings: { viewMode, autoCollapseViewed } } = useSettings();
  const autoCollapseRef = useRef(autoCollapseViewed);
  useEffect(() => { autoCollapseRef.current = autoCollapseViewed; }, [autoCollapseViewed]);
  const allRows = useMemo(() => buildSplitRows(file), [file]);
  const allUnifiedRows = useMemo(() => buildUnifiedRows(file), [file]);
  const lang = useMemo(() => getLanguage(file.file), [file.file]);

  const activeRows = viewMode === "unified" ? allUnifiedRows : allRows;
  const isLarge = activeRows.length > AUTO_COLLAPSE_THRESHOLD;

  const [collapsed, setCollapsed] = useState(isLarge);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (forceOpen) setCollapsed(false);
  }, [forceOpen]);

  useEffect(() => {
    if (collapseSignal !== undefined) setCollapsed(collapseSignal);
  }, [collapseSignal]);

  useEffect(() => {
    if (viewed && autoCollapseRef.current) setCollapsed(true);
  }, [viewed]);

  const rows = showAll ? allRows : allRows.slice(0, TRUNCATE_THRESHOLD);
  const unifiedRows = showAll ? allUnifiedRows : allUnifiedRows.slice(0, TRUNCATE_THRESHOLD);
  const hidden = activeRows.length - TRUNCATE_THRESHOLD;

  const badge =
    fc.length > 0 ? (
      <span className="cbadge">
        {fc.length} comment{fc.length !== 1 ? "s" : ""}
      </span>
    ) : null;

  const sizeBadge = isLarge ? (
    <span className="cbadge">{activeRows.length} lines</span>
  ) : null;

  const hasUnresolved = fc.some(({ idx }) => !decisions[idx]?.decision);

  const splitPlacements = useMemo(() => buildSplitPlacements(fc, allRows), [fc, allRows]);
  const unifiedPlacements = useMemo(() => buildUnifiedPlacements(fc, allUnifiedRows), [fc, allUnifiedRows]);

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

    const comments = splitPlacements.get(ri) ?? [];
    const hasCmt = comments.length > 0;
    const trCls = hasCmt ? "has-comment" : "";

    if (row.type === "ctx") {
      trows.push(
        <tr key={`r${ri}`} className={trCls}>
          <td className="ln ln-ctx">{String(row.oln)}</td>
          <td className="code code-ctx">{hl(row.content, lang)}</td>
          <td className="sep" />
          <td className="ln ln-ctx">{String(row.nln)}</td>
          <td className="code code-ctx">{hl(row.content, lang)}</td>
        </tr>
      );
    } else {
      const d = row.del;
      const a = row.add;
      trows.push(
        <tr key={`r${ri}`} className={trCls}>
          <td className={`ln ${d ? "ln-del" : "ln-del-empty"}`}>{d ? String(d.ln) : ""}</td>
          <td className={`code ${d ? "code-del" : "code-del-empty"}`}>{hl(d?.content, lang)}</td>
          <td className="sep" />
          <td className={`ln ${a ? "ln-add" : "ln-add-empty"}`}>{a ? String(a.ln) : ""}</td>
          <td className={`code ${a ? "code-add" : "code-add-empty"}`}>{hl(a?.content, lang)}</td>
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
            snapped={item.snapped}
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

  const unifiedTrows: React.ReactNode[] = [];
  unifiedRows.forEach(function (row, ri) {
    if (row.type === "hunk") {
      unifiedTrows.push(
        <tr key={`uh${ri}`} className="hunk-hdr">
          <td colSpan={4}>{row.label}</td>
        </tr>
      );
      return;
    }

    const comments = unifiedPlacements.get(ri) ?? [];
    const hasCmt = comments.length > 0;
    const trCls = hasCmt ? "has-comment" : "";

    if (row.type === "del") {
      unifiedTrows.push(
        <tr key={`ur${ri}`} className={trCls}>
          <td className="ln ln-del">{String(row.oln)}</td>
          <td className="ln ln-del-empty" />
          <td className="sign sign-del">-</td>
          <td className="code code-del">{hl(row.content, lang)}</td>
        </tr>
      );
    } else if (row.type === "add") {
      unifiedTrows.push(
        <tr key={`ur${ri}`} className={trCls}>
          <td className="ln ln-add-empty" />
          <td className="ln ln-add">{String(row.nln)}</td>
          <td className="sign sign-add">+</td>
          <td className="code code-add">{hl(row.content, lang)}</td>
        </tr>
      );
    } else {
      unifiedTrows.push(
        <tr key={`ur${ri}`} className={trCls}>
          <td className="ln ln-ctx">{String(row.oln)}</td>
          <td className="ln ln-ctx">{String(row.nln)}</td>
          <td className="sign sign-ctx"> </td>
          <td className="code code-ctx">{hl(row.content, lang)}</td>
        </tr>
      );
    }

    if (hasCmt) {
      comments.forEach(function (item) {
        const dec = decisions[item.idx] || {};
        const card = (
          <CommentCard
            comment={item.comment}
            idx={item.idx}
            decision={dec.decision}
            discussText={dec.discussText}
            onDecide={onDecide}
            snapped={item.snapped}
          />
        );
        unifiedTrows.push(
          <tr key={`uc${item.idx}`} className="cmt-row">
            <td colSpan={4} className="cmt-cell">{card}</td>
          </tr>
        );
      });
    }
  });

  return (
    <div className={`fblock${selected ? " fblock-selected" : ""}${viewed ? " fblock-viewed" : ""}`} id={`file-${CSS.escape(file.file)}`}>
      <div className="fhdr" onClick={() => setCollapsed((c) => !c)} style={{ cursor: "pointer" }}>
        <span className="collapse-icon">{collapsed ? "▶" : "▼"}</span>
        <span className="fname">{file.file}</span>
        {badge}
        {sizeBadge}
        <span style={{ flex: 1 }} />
        <label
          className="viewed-check"
          onClick={(e) => e.stopPropagation()}
          data-tooltip={hasUnresolved ? "Resolve all comments first" : undefined}
        >
          <input
            type="checkbox"
            checked={viewed ?? false}
            onChange={onToggleViewed}
            disabled={hasUnresolved}
          />
          Viewed
        </label>
      </div>
      {!collapsed && (
        file.binary ? (
          <div className="bin-note">Binary file &mdash; diff not shown</div>
        ) : viewMode === "unified" ? (
          <>
            <table className="diff-table">
              <colgroup>
                <col className="ln" />
                <col className="ln" />
                <col className="sign" />
                <col className="code" />
              </colgroup>
              <tbody>{unifiedTrows}</tbody>
            </table>
            {!showAll && hidden > 0 && (
              <button className="load-more" onClick={() => setShowAll(true)}>
                Load {hidden} more lines
              </button>
            )}
          </>
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

import type { ReviewResult } from "../output.js";

export function buildHTML(result: ReviewResult, diff: string): string {
  const escaped = JSON.stringify({ result, diff })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return page(escaped);
}

function page(data: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi Review</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.5}
#hdr{background:#161b22;border-bottom:1px solid #30363d;padding:10px 24px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:10;flex-wrap:wrap}
#hdr h1{font-size:15px;font-weight:600}
#progress{font-size:12px;color:#8b949e;margin-left:auto}
.tbtn{cursor:pointer;color:#58a6ff;background:none;border:1px solid #30363d;border-radius:6px;padding:4px 10px;font-size:12px}
.act-btn{cursor:pointer;background:none;border:1px solid #30363d;border-radius:6px;padding:4px 12px;font-size:12px;color:#e6edf3}
.act-btn:disabled{opacity:.35;cursor:not-allowed}
.act-btn.primary{border-color:#238636;color:#3fb950}
.act-btn.primary:not(:disabled):hover{background:#1a4731}
.act-btn:not(.primary):not(:disabled):hover{background:#21262d}
#summary{background:#161b22;border-bottom:1px solid #30363d;padding:14px 24px}
#summary p{color:#c9d1d9;white-space:pre-wrap;max-width:900px;font-size:13px}
#files{padding:16px 24px;display:flex;flex-direction:column;gap:12px;max-width:1600px;margin:0 auto}
.fblock{border:1px solid #30363d;border-radius:6px;overflow:hidden}
.fhdr{background:#161b22;padding:7px 14px;font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;color:#8b949e;display:flex;align-items:center;gap:8px}
.fname{color:#58a6ff;font-weight:600}
.cbadge{background:#21262d;border-radius:10px;padding:1px 8px;font-size:11px;color:#8b949e}
/* Split diff table */
.diff-table{width:100%;border-collapse:collapse;font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;table-layout:fixed}
.diff-table col.ln{width:44px}
.diff-table col.code{width:calc(50% - 45px)}
.diff-table col.sep{width:1px}
td.ln{text-align:right;color:#6e7681;user-select:none;padding:1px 6px;white-space:nowrap;vertical-align:top}
td.code{padding:1px 8px;white-space:pre-wrap;word-break:break-all;vertical-align:top}
td.sep{background:#21262d;padding:0;width:1px}
/* Del side */
td.ln-del{background:#220d0d;color:#f85149}
td.code-del{background:#220d0d}
td.ln-del-empty{background:#1a0a0a}
td.code-del-empty{background:#1a0a0a}
/* Add side */
td.ln-add{background:#122119;color:#3fb950}
td.code-add{background:#122119}
td.ln-add-empty{background:#0d1a10}
td.code-add-empty{background:#0d1a10}
/* Context */
td.ln-ctx{background:#0d1117;color:#6e7681}
td.code-ctx{background:#0d1117;color:#e6edf3}
/* Hunk header */
tr.hunk-hdr td{background:#1c2128;color:#6e7681;padding:3px 8px;font-size:11px}
/* Comment row */
tr.cmt-row td{padding:0;background:#0d1117}
td.cmt-cell{padding:4px 8px;vertical-align:top}
td.cmt-empty{background:#0d1117}
/* Highlight rows that have comments */
tr.has-comment td.code-del,tr.has-comment td.ln-del{background:#2d1515!important}
tr.has-comment td.code-add,tr.has-comment td.ln-add{background:#0e2318!important}
tr.has-comment td.code-ctx,tr.has-comment td.ln-ctx{background:rgba(88,166,255,.06)!important}
/* Comment card */
.cc{border-left:3px solid;background:#161b22;border-radius:4px;overflow:hidden;margin-bottom:4px}
.cc:last-child{margin-bottom:0}
.cc.critical{border-left-color:#f85149}.cc.warn{border-left-color:#d29922}.cc.info{border-left-color:#388bfd}
.cc-meta{padding:6px 14px 2px;font-family:"SFMono-Regular",Consolas,monospace;font-size:11px;color:#8b949e}
.cc-body{padding:2px 14px 8px;font-size:12px;color:#c9d1d9;line-height:1.5;white-space:pre-wrap}
.cc-actions{display:flex;gap:6px;padding:0 14px 8px}
.dbtn{cursor:pointer;background:none;border:1px solid #30363d;border-radius:4px;padding:3px 10px;font-size:11px;color:#8b949e}
.dbtn:hover{background:#21262d;color:#e6edf3}
.dbtn.a-accept{background:#1a4731;border-color:#238636;color:#3fb950}
.dbtn.a-reject{background:#4a1a1a;border-color:#6e3232;color:#f85149}
.dbtn.a-discuss{background:#1a2f4a;border-color:#2a5080;color:#58a6ff}
.discuss-area{padding:0 14px 10px}
.discuss-area textarea{width:100%;height:60px;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font-size:12px;padding:6px 8px;resize:none;font-family:inherit}
.discuss-area textarea:focus{outline:none;border-color:#58a6ff}
.bin-note{padding:10px 16px;color:#8b949e;font-style:italic;font-family:"SFMono-Regular",Consolas,monospace;font-size:12px}
.done-msg{padding:40px 24px;color:#8b949e;text-align:center}
</style>
</head>
<body>
<div id="root"></div>
<script>var __DATA__=${data};</script>
<script type="module">
import { h, render, Fragment } from 'https://esm.sh/preact@10.24.3';
import { useState, useCallback, useEffect } from 'https://esm.sh/preact@10.24.3/hooks';

var R = __DATA__.result;
var rawDiff = __DATA__.diff;
var totalComments = R.comments.length;

// ── Diff parser ───────────────────────────────────────────────────────────────
function parseDiff(txt) {
  var files = [], cur = null, curH = null;
  txt.split('\\n').forEach(function(line) {
    if (line.startsWith('diff --git ')) {
      if (cur) files.push(cur);
      var m = line.match(/diff --git a\\/(.+) b\\/(.+)/);
      cur = { file: m ? m[2] : 'unknown', hunks: [], binary: false };
      curH = null;
    } else if (cur && line.startsWith('Binary files')) {
      cur.binary = true;
    } else if (cur && /^@@ -\\d/.test(line)) {
      var hm = line.match(/@@ -(\\d+)(?:,(\\d+))? \\+(\\d+)(?:,(\\d+))? @@(.*)/);
      curH = { os: hm ? +hm[1] : 1, ns: hm ? +hm[3] : 1, ctx: hm ? hm[5] : '', lines: [] };
      cur.hunks.push(curH);
    } else if (curH && !line.startsWith('---') && !line.startsWith('+++') && line !== '\\\\ No newline at end of file') {
      curH.lines.push(line);
    }
  });
  if (cur) files.push(cur);
  return files;
}

// Build split rows: each row is { type:'ctx'|'change'|'hunk', del?, add?, label? }
// del/add: { content, ln } or null
function buildSplitRows(file) {
  var rows = [];
  file.hunks.forEach(function(hunk) {
    rows.push({ type: 'hunk', label: '@@ -' + hunk.os + ' +' + hunk.ns + ' @@' + hunk.ctx });
    var dels = [], adds = [];
    var o = hunk.os, n = hunk.ns;

    function flush() {
      var max = Math.max(dels.length, adds.length);
      for (var i = 0; i < max; i++) {
        rows.push({ type: 'change', del: dels[i] || null, add: adds[i] || null });
      }
      dels = []; adds = [];
    }

    hunk.lines.forEach(function(l) {
      if (l.startsWith('-'))      { dels.push({ content: l.slice(1), ln: o++ }); }
      else if (l.startsWith('+')) { adds.push({ content: l.slice(1), ln: n++ }); }
      else {
        flush();
        var c = l.startsWith(' ') ? l.slice(1) : l;
        rows.push({ type: 'ctx', content: c, oln: o++, nln: n++ });
      }
    });
    flush();
  });
  return rows;
}

// ── Comment lookup ────────────────────────────────────────────────────────────
var byFile = {};
R.comments.forEach(function(c, i) {
  (byFile[c.file] = byFile[c.file] || []).push({ comment: c, idx: i });
});

function rowComments(fc, row) {
  return fc.filter(function(item) {
    var c = item.comment;
    if (row.type === 'hunk') return false;
    if (row.type === 'ctx') {
      if (c.side === 'LEFT')  return row.oln === c.line;
      return row.nln === c.line;
    }
    // change row
    if (c.side === 'LEFT')  return row.del && row.del.ln === c.line;
    return row.add && row.add.ln === c.line;
  });
}

// ── CommentCard ───────────────────────────────────────────────────────────────
function CommentCard(props) {
  var c = props.comment, idx = props.idx, decision = props.decision;
  var discussText = props.discussText || '';
  var onDecide = props.onDecide;
  var sev = (c.severity || 'info').toLowerCase();

  return h('div', { className: 'cc ' + sev },
    h('div', { className: 'cc-meta' }, c.file + ':' + c.line + '  [' + c.severity + ']'),
    h('div', { className: 'cc-body' }, c.body),
    h('div', { className: 'cc-actions' },
      h('button', { className: 'dbtn' + (decision === 'accept'  ? ' a-accept'  : ''), onClick: function() { onDecide(idx, 'accept',  ''); } }, '\\u2705 Accept'),
      h('button', { className: 'dbtn' + (decision === 'reject'  ? ' a-reject'  : ''), onClick: function() { onDecide(idx, 'reject',  ''); } }, '\\u274c Reject'),
      h('button', { className: 'dbtn' + (decision === 'discuss' ? ' a-discuss' : ''), onClick: function() { onDecide(idx, 'discuss', discussText); } }, '\\ud83d\\udcac Discuss')
    ),
    decision === 'discuss' && h('div', { className: 'discuss-area' },
      h('textarea', {
        placeholder: 'Your note...',
        value: discussText,
        onInput: function(e) { onDecide(idx, 'discuss', e.target.value); }
      })
    )
  );
}

// ── FileDiff ──────────────────────────────────────────────────────────────────
function FileDiff(props) {
  var file = props.file, decisions = props.decisions, onDecide = props.onDecide;
  var fc = byFile[file.file] || [];
  var badge = fc.length ? h('span', { className: 'cbadge' }, fc.length + ' comment' + (fc.length !== 1 ? 's' : '')) : null;

  var trows = [];
  buildSplitRows(file).forEach(function(row, ri) {
    if (row.type === 'hunk') {
      trows.push(h('tr', { key: 'h' + ri, className: 'hunk-hdr' },
        h('td', { colSpan: 5 }, row.label)
      ));
      return;
    }

    var comments = rowComments(fc, row);
    var hasCmt = comments.length > 0;
    var trCls = hasCmt ? 'has-comment' : '';

    if (row.type === 'ctx') {
      trows.push(h('tr', { key: 'r' + ri, className: trCls },
        h('td', { className: 'ln ln-ctx' }, String(row.oln)),
        h('td', { className: 'code code-ctx' }, row.content || '\\u00a0'),
        h('td', { className: 'sep' }),
        h('td', { className: 'ln ln-ctx' }, String(row.nln)),
        h('td', { className: 'code code-ctx' }, row.content || '\\u00a0')
      ));
    } else {
      // change row: del on left, add on right
      var d = row.del, a = row.add;
      trows.push(h('tr', { key: 'r' + ri, className: trCls },
        h('td', { className: 'ln ' + (d ? 'ln-del' : 'ln-del-empty') }, d ? String(d.ln) : ''),
        h('td', { className: 'code ' + (d ? 'code-del' : 'code-del-empty') }, d ? d.content || '\\u00a0' : ''),
        h('td', { className: 'sep' }),
        h('td', { className: 'ln ' + (a ? 'ln-add' : 'ln-add-empty') }, a ? String(a.ln) : ''),
        h('td', { className: 'code ' + (a ? 'code-add' : 'code-add-empty') }, a ? a.content || '\\u00a0' : '')
      ));
    }

    if (hasCmt) {
      comments.forEach(function(item) {
        var d = decisions[item.idx] || {};
        var isLeft = item.comment.side === 'LEFT';
        var card = h(CommentCard, { comment: item.comment, idx: item.idx, decision: d.decision, discussText: d.discussText, onDecide: onDecide });
        trows.push(h('tr', { key: 'c' + item.idx, className: 'cmt-row' },
          isLeft
            ? [h('td', { key: 'l', colSpan: 2, className: 'cmt-cell' }, card), h('td', { key: 's', className: 'sep' }), h('td', { key: 'r', colSpan: 2, className: 'cmt-empty' })]
            : [h('td', { key: 'l', colSpan: 2, className: 'cmt-empty' }), h('td', { key: 's', className: 'sep' }), h('td', { key: 'r', colSpan: 2, className: 'cmt-cell' }, card)]
        ));
      });
    }
  });

  return h('div', { className: 'fblock' },
    h('div', { className: 'fhdr' }, h('span', { className: 'fname' }, file.file), badge),
    file.binary
      ? h('div', { className: 'bin-note' }, 'Binary file \\u2014 diff not shown')
      : h('table', { className: 'diff-table' },
          h('colgroup', null,
            h('col', { className: 'ln' }),
            h('col', { className: 'code' }),
            h('col', { className: 'sep' }),
            h('col', { className: 'ln' }),
            h('col', { className: 'code' })
          ),
          h('tbody', null, trows)
        )
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  var [decisions, setDecisions] = useState({});
  var [summaryOpen, setSummaryOpen] = useState(false);
  var [submitted, setSubmitted] = useState(false);

  var decidedCount = Object.values(decisions).filter(function(d) { return d.decision; }).length;
  var allDone = totalComments > 0 && decidedCount === totalComments;

  var onDecide = useCallback(function(idx, decision, discussText) {
    setDecisions(function(prev) {
      var next = Object.assign({}, prev);
      next[idx] = { decision: decision, discussText: discussText };
      return next;
    });
  }, []);

  useEffect(function() {
    var iv = setInterval(function() { fetch('/ping').catch(function() {}); }, 2000);
    return function() { clearInterval(iv); };
  }, []);

  function doAction(type) {
    var list = R.comments.map(function(_, i) {
      var d = decisions[i] || {};
      return { index: i, decision: d.decision || 'reject', discussText: d.discussText || '' };
    });
    fetch('/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type, decisions: list }) })
      .then(function() { setSubmitted(true); });
  }

  if (submitted) return h('p', { className: 'done-msg' }, 'Done \\u2014 you can close this tab.');

  var parsed = parseDiff(rawDiff);

  return h(Fragment, null,
    h('div', { id: 'hdr' },
      h('span', null, '\\ud83d\\udd0d'),
      h('h1', null, 'Pi Review'),
      h('button', { className: 'tbtn', onClick: function() { setSummaryOpen(function(o) { return !o; }); } }, 'Summary'),
      h('span', { id: 'progress' }, decidedCount + ' / ' + totalComments + ' decided'),
      h('button', { className: 'act-btn',        disabled: !allDone, onClick: function() { doAction('save'); } }, 'Save'),
      h('button', { className: 'act-btn primary', disabled: !allDone, onClick: function() { doAction('send'); } }, 'Send to agent'),
      h('button', { className: 'act-btn',         disabled: !allDone, onClick: function() { doAction('save-and-send'); } }, 'Save & Send')
    ),
    summaryOpen && h('div', { id: 'summary' }, h('p', null, R.summary)),
    h('div', { id: 'files' },
      parsed.map(function(file, i) {
        return h(FileDiff, { key: file.file + i, file: file, decisions: decisions, onDecide: onDecide });
      })
    )
  );
}

render(h(App, null), document.getElementById('root'));
</script>
</body>
</html>`;
}

export function buildHTML(result, diff) {
    const escaped = JSON.stringify({ result, diff })
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");
    return page(escaped);
}
function page(data) {
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
#toggle-summary{cursor:pointer;color:#58a6ff;background:none;border:1px solid #30363d;border-radius:6px;padding:4px 10px;font-size:12px}
#progress{font-size:12px;color:#8b949e;margin-left:auto}
.act-btn{cursor:pointer;background:none;border:1px solid #30363d;border-radius:6px;padding:4px 12px;font-size:12px;color:#e6edf3}
.act-btn:disabled{opacity:.35;cursor:not-allowed}
.act-btn.primary{border-color:#238636;color:#3fb950}
.act-btn.primary:not(:disabled):hover{background:#1a4731}
.act-btn:not(.primary):not(:disabled):hover{background:#21262d}
#summary{background:#161b22;border-bottom:1px solid #30363d;padding:14px 24px;display:none}
#summary.open{display:block}
#summary p{color:#c9d1d9;white-space:pre-wrap;max-width:900px;font-size:13px}
#files{padding:16px 24px;display:flex;flex-direction:column;gap:12px;max-width:1600px;margin:0 auto}
.fblock{border:1px solid #30363d;border-radius:6px;overflow:hidden}
.fhdr{background:#161b22;padding:7px 14px;font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;color:#8b949e;display:flex;align-items:center;gap:8px}
.fname{color:#58a6ff}
.cbadge{margin-left:auto;background:#21262d;border-radius:10px;padding:1px 8px;font-size:11px;color:#8b949e}
.ewrap{width:100%}
/* Comment cards inside Monaco view zones */
.ewrap{width:100%}
.comment-line-bg{background:rgba(88,166,255,.07)!important}
.comment-line-gutter{background:#58a6ff;width:3px!important;margin-left:3px}
.comments-panel{border-top:1px solid #30363d}
.cc{border-left:3px solid;background:#161b22;border-bottom:1px solid #21262d}
.cc.critical{border-left-color:#f85149}.cc.warn{border-left-color:#d29922}.cc.info{border-left-color:#388bfd}
.cc-meta{padding:6px 14px 2px;font-family:"SFMono-Regular",Consolas,monospace;font-size:11px;color:#8b949e}
.cc-body{padding:2px 14px 8px;font-size:12px;color:#c9d1d9;line-height:1.4}
.cc-actions{display:flex;gap:6px;padding:0 14px 8px}
.dbtn{cursor:pointer;background:none;border:1px solid #30363d;border-radius:4px;padding:3px 10px;font-size:11px;color:#8b949e}
.dbtn:hover{background:#21262d;color:#e6edf3}
.cc[data-d="accept"] .dbtn.accept{background:#1a4731;border-color:#238636;color:#3fb950}
.cc[data-d="reject"] .dbtn.reject{background:#4a1a1a;border-color:#6e3232;color:#f85149}
.cc[data-d="discuss"] .dbtn.discuss{background:#1a2f4a;border-color:#2a5080;color:#58a6ff}
.discuss-area{padding:0 14px 10px;display:none}
.discuss-area textarea{width:100%;height:60px;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font-size:12px;padding:6px 8px;resize:none;font-family:inherit}
.discuss-area textarea:focus{outline:none;border-color:#58a6ff}
</style>
</head>
<body>
<div id="hdr">
  <span>🔍</span>
  <h1>Pi Review</h1>
  <button id="toggle-summary" onclick="toggleSummary()">Summary</button>
  <span id="progress"></span>
  <button id="btn-save"  class="act-btn"         disabled onclick="doAction('save')">Save</button>
  <button id="btn-send"  class="act-btn primary"  disabled onclick="doAction('send')">Send to agent</button>
  <button id="btn-ss"    class="act-btn"         disabled onclick="doAction('save-and-send')">Save &amp; Send</button>
</div>
<div id="summary"><p id="summary-text"></p></div>
<div id="files"></div>
<script>var __DATA__=${data};</script>
<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs/loader.js"></script>
<script>
(function () {
  var R = __DATA__.result;
  var rawDiff = __DATA__.diff;
  var total = R.comments.length;

  document.getElementById('summary-text').textContent = R.summary;
  window.toggleSummary = function () {
    document.getElementById('summary').classList.toggle('open');
  };

  // ── State ────────────────────────────────────────────────────────────────
  var decisions = {};  // globalIndex -> {decision, discussText}

  function updateProgress() {
    var n = Object.keys(decisions).filter(function(k){ return decisions[k].decision; }).length;
    document.getElementById('progress').textContent = n + ' / ' + total + ' decided';
    var done = (n === total);
    ['btn-save','btn-send','btn-ss'].forEach(function(id){
      document.getElementById(id).disabled = !done;
    });
  }

  window.doAction = function (type) {
    var list = R.comments.map(function (_, i) {
      var d = decisions[i] || {};
      return { index: i, decision: d.decision || 'reject', discussText: d.discussText || '' };
    });
    fetch('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, decisions: list })
    }).then(function () {
      document.getElementById('files').innerHTML =
        '<p style="padding:40px 24px;color:#8b949e;text-align:center">Done — you can close this tab.</p>';
      ['btn-save','btn-send','btn-ss'].forEach(function(id){
        document.getElementById(id).disabled = true;
      });
    });
  };

  // Heartbeat so server detects tab close
  setInterval(function () { fetch('/ping').catch(function(){}); }, 2000);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function parseDiff(txt) {
    var files = [], cur = null, curH = null;
    txt.split('\\n').forEach(function (line) {
      if (line.startsWith('diff --git ')) {
        if (cur) files.push(cur);
        var m = line.match(/diff --git a\\/(.*) b\\/(.*)/);
        cur = { file: m ? m[2] : 'unknown', hunks: [], binary: false };
        curH = null;
      } else if (cur && line.startsWith('Binary files')) {
        cur.binary = true;
      } else if (cur && /^@@ -\\d/.test(line)) {
        var hm = line.match(/@@ -(\\d+)(?:,(\\d+))? \\+(\\d+)(?:,(\\d+))? @@/);
        curH = { os: hm ? parseInt(hm[1]) : 1, ns: hm ? parseInt(hm[3]) : 1, lines: [] };
        cur.hunks.push(curH);
      } else if (curH && line !== '\\\\ No newline at end of file') {
        if (!line.startsWith('---') && !line.startsWith('+++')) curH.lines.push(line);
      }
    });
    if (cur) files.push(cur);
    return files;
  }

  function buildModels(file) {
    var orig = '', mod = '', om = {}, mm = {}, ol = 0, ml = 0;
    file.hunks.forEach(function (h) {
      var of = h.os, mf = h.ns;
      h.lines.forEach(function (l) {
        if (l.startsWith('-')) {
          orig += l.slice(1) + '\\n'; ol++; om[of] = ol; of++;
        } else if (l.startsWith('+')) {
          mod += l.slice(1) + '\\n'; ml++; mm[mf] = ml; mf++;
        } else {
          var c = l.startsWith(' ') ? l.slice(1) : '';
          orig += c + '\\n'; mod += c + '\\n';
          ol++; ml++; om[of] = ol; mm[mf] = ml; of++; mf++;
        }
      });
    });
    var omRev = {}, mmRev = {};
    Object.keys(om).forEach(function(k){ omRev[om[k]] = +k; });
    Object.keys(mm).forEach(function(k){ mmRev[mm[k]] = +k; });
    return { original: orig.replace(/\\n$/, ''), modified: mod.replace(/\\n$/, ''), origLineMap: om, modLineMap: mm, origRevMap: omRev, modRevMap: mmRev };
  }

  function renderCommentsPanel(container, fc) {
    if (!fc.length) return;
    var panel = document.createElement('div');
    panel.className = 'comments-panel';
    fc.forEach(function (item) {
      var comment = item.comment;
      var idx     = item.idx;

      var card = document.createElement('div');
      card.className = 'cc ' + comment.severity.toLowerCase();
      card.id = 'cc-' + idx;

      var meta = document.createElement('div');
      meta.className = 'cc-meta';
      meta.textContent = comment.file + ':' + comment.line + '  [' + comment.severity + ']';
      card.appendChild(meta);

      var body = document.createElement('div');
      body.className = 'cc-body';
      body.textContent = comment.body;
      card.appendChild(body);

      var actions = document.createElement('div');
      actions.className = 'cc-actions';
      [['accept','✅ Accept'],['reject','❌ Reject'],['discuss','💬 Discuss']].forEach(function(pair) {
        var btn = document.createElement('button');
        btn.className = 'dbtn ' + pair[0];
        btn.textContent = pair[1];
        btn.addEventListener('click', function() {
          if (!decisions[idx]) decisions[idx] = {};
          decisions[idx].decision = pair[0];
          card.dataset.d = pair[0];
          da.style.display = (pair[0] === 'discuss') ? 'block' : 'none';
          updateProgress();
        });
        actions.appendChild(btn);
      });
      card.appendChild(actions);

      var da = document.createElement('div');
      da.className = 'discuss-area';
      da.id = 'da-' + idx;
      var ta = document.createElement('textarea');
      ta.placeholder = 'Your note...';
      ta.addEventListener('input', function() {
        if (!decisions[idx]) decisions[idx] = {};
        decisions[idx].discussText = ta.value;
      });
      da.appendChild(ta);
      card.appendChild(da);

      panel.appendChild(card);
    });
    container.appendChild(panel);
  }

  // ── Build DOM ────────────────────────────────────────────────────────────
  var byFile = {};
  R.comments.forEach(function (c, i) {
    (byFile[c.file] = byFile[c.file] || []).push({ comment: c, idx: i });
  });

  var parsed = parseDiff(rawDiff);
  var filesDiv = document.getElementById('files');
  var pending = [];

  parsed.forEach(function (file) {
    var block = document.createElement('div');
    block.className = 'fblock';
    var fc = byFile[file.file] || [];
    var hdr = document.createElement('div');
    hdr.className = 'fhdr';
    hdr.innerHTML = '<span class="fname">' + esc(file.file) + '</span>' +
      (fc.length ? '<span class="cbadge">' + fc.length + ' comment' + (fc.length > 1 ? 's' : '') + '</span>' : '');
    block.appendChild(hdr);

    if (file.binary) {
      var bin = document.createElement('div');
      bin.style.cssText = 'padding:10px 16px;color:#8b949e;font-style:italic;';
      bin.textContent = 'Binary file — diff not shown';
      block.appendChild(bin);
    } else {
      var wrap = document.createElement('div');
      wrap.className = 'ewrap';
      block.appendChild(wrap);
      pending.push({ wrap: wrap, block: block, file: file, fc: fc });
    }
    filesDiv.appendChild(block);
  });

  updateProgress();

  // ── Monaco ───────────────────────────────────────────────────────────────
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    pending.forEach(function (entry) {
      var m = buildModels(entry.file);
      var lc = Math.max(
        m.original ? m.original.split('\\n').length : 1,
        m.modified  ? m.modified.split('\\n').length  : 1
      );
      entry.wrap.style.height = Math.max(80, Math.min(lc * 19 + 40, 700)) + 'px';

      var de = monaco.editor.createDiffEditor(entry.wrap, {
        readOnly: true, renderSideBySide: true, theme: 'vs-dark',
        fontSize: 12, lineNumbers: 'on', scrollBeyondLastLine: false,
        minimap: { enabled: false }, renderIndicators: true, ignoreTrimWhitespace: false
      });
      de.setModel({
        original: monaco.editor.createModel(m.original, 'text/plain'),
        modified: monaco.editor.createModel(m.modified, 'text/plain')
      });

      // Show actual file line numbers instead of hunk-relative numbers
      de.getOriginalEditor().updateOptions({ lineNumbers: function(n){ return m.origRevMap[n] ? String(m.origRevMap[n]) : String(n); } });
      de.getModifiedEditor().updateOptions({ lineNumbers: function(n){ return m.modRevMap[n]  ? String(m.modRevMap[n])  : String(n); } });

      // Highlight commented lines in the diff
      var origDecs = [], modDecs = [];
      entry.fc.forEach(function(item) {
        var lineMap = item.comment.side === 'LEFT' ? m.origLineMap : m.modLineMap;
        var ml = lineMap[item.comment.line];
        if (!ml) return;
        var dec = { range: new monaco.Range(ml,1,ml,1), options: { isWholeLine: true, className: 'comment-line-bg', linesDecorationsClassName: 'comment-line-gutter' } };
        if (item.comment.side === 'LEFT') origDecs.push(dec); else modDecs.push(dec);
      });
      if (origDecs.length) de.getOriginalEditor().createDecorationsCollection(origDecs);
      if (modDecs.length)  de.getModifiedEditor().createDecorationsCollection(modDecs);

      // Comments rendered as plain HTML below the editor — no view zones
      renderCommentsPanel(entry.block, entry.fc);
    });
  });
})();
</script>
</body>
</html>`;
}

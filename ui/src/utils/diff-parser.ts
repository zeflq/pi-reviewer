export interface SplitRow {
  type: "hunk" | "ctx" | "change" | "expand";
  label?: string;
  content?: string;
  oln?: number;
  nln?: number;
  del?: { content: string; ln: number } | null;
  add?: { content: string; ln: number } | null;
  hiddenCount?: number;
  fromOln?: number;
  toOln?: number;
}

export interface ParsedFile {
  file: string;
  hunks: Array<{ os: number; ns: number; ctx: string; lines: string[] }>;
  binary: boolean;
}

export function parseDiff(txt: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  let cur: ParsedFile | null = null;
  let curH: ParsedFile["hunks"][number] | null = null;

  txt.split("\n").forEach(function (line) {
    if (line.startsWith("diff --git ")) {
      if (cur) files.push(cur);
      const m = line.match(/diff --git a\/(.+) b\/(.+)/);
      cur = { file: m ? m[2] : "unknown", hunks: [], binary: false };
      curH = null;
    } else if (cur && line.startsWith("Binary files")) {
      cur.binary = true;
    } else if (cur && /^@@ -\d/.test(line)) {
      const hm = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
      curH = { os: hm ? +hm[1] : 1, ns: hm ? +hm[3] : 1, ctx: hm ? hm[5] : "", lines: [] };
      cur.hunks.push(curH);
    } else if (
      curH &&
      !line.startsWith("---") &&
      !line.startsWith("+++") &&
      line !== "\\ No newline at end of file"
    ) {
      curH.lines.push(line);
    }
  });

  if (cur) files.push(cur);
  return files;
}

export interface UnifiedRow {
  type: "hunk" | "del" | "add" | "ctx" | "expand";
  label?: string;
  content?: string;
  oln?: number;
  nln?: number;
  hiddenCount?: number;
  fromOln?: number;
  toOln?: number;
}

export function buildUnifiedRows(file: ParsedFile): UnifiedRow[] {
  const rows: UnifiedRow[] = [];

  for (let hi = 0; hi < file.hunks.length; hi++) {
    const hunk = file.hunks[hi];
    rows.push({ type: "hunk", label: "@@ -" + hunk.os + " +" + hunk.ns + " @@" + hunk.ctx });

    let o = hunk.os;
    let n = hunk.ns;

    hunk.lines.forEach(function (l) {
      if (l.startsWith("-")) {
        rows.push({ type: "del", content: l.slice(1), oln: o++ });
      } else if (l.startsWith("+")) {
        rows.push({ type: "add", content: l.slice(1), nln: n++ });
      } else {
        const c = l.startsWith(" ") ? l.slice(1) : l;
        rows.push({ type: "ctx", content: c, oln: o++, nln: n++ });
      }
    });

    const next = file.hunks[hi + 1];
    if (next) {
      const hidden = next.os - o;
      if (hidden > 0) rows.push({ type: "expand", hiddenCount: hidden, fromOln: o, toOln: next.os - 1 });
    }
  }

  return rows;
}

export function buildSplitRows(file: ParsedFile): SplitRow[] {
  const rows: SplitRow[] = [];

  for (let hi = 0; hi < file.hunks.length; hi++) {
    const hunk = file.hunks[hi];
    rows.push({ type: "hunk", label: "@@ -" + hunk.os + " +" + hunk.ns + " @@" + hunk.ctx });

    let dels: Array<{ content: string; ln: number }> = [];
    let adds: Array<{ content: string; ln: number }> = [];
    let o = hunk.os;
    let n = hunk.ns;

    function flush() {
      const max = Math.max(dels.length, adds.length);
      for (let i = 0; i < max; i++) {
        rows.push({ type: "change", del: dels[i] || null, add: adds[i] || null });
      }
      dels = [];
      adds = [];
    }

    hunk.lines.forEach(function (l) {
      if (l.startsWith("-")) {
        dels.push({ content: l.slice(1), ln: o++ });
      } else if (l.startsWith("+")) {
        adds.push({ content: l.slice(1), ln: n++ });
      } else {
        flush();
        const c = l.startsWith(" ") ? l.slice(1) : l;
        rows.push({ type: "ctx", content: c, oln: o++, nln: n++ });
      }
    });

    flush();

    const next = file.hunks[hi + 1];
    if (next) {
      const hidden = next.os - o;
      if (hidden > 0) rows.push({ type: "expand", hiddenCount: hidden, fromOln: o, toOln: next.os - 1 });
    }
  }

  return rows;
}

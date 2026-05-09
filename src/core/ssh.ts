import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { dirname as posixDirname, join as posixJoin, relative as posixRelative } from "node:path/posix";

export interface FsOps {
  read(p: string): Promise<string | null>;
  list(dir: string): Promise<string[]>;
  join(...parts: string[]): string;
  dirname(p: string): string;
  relative(from: string, to: string): string;
}

export interface SshState {
  remote: string;
  remoteCwd: string;
}

export function localFs(): FsOps {
  return {
    async read(p) {
      try { return await readFile(p, "utf-8"); }
      catch { return null; }
    },
    async list(dir) {
      try { return await readdir(dir); }
      catch { return []; }
    },
    join,
    dirname,
    relative,
  };
}

export function sshExec(remote: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("ssh", [remote, command], { encoding: "utf8" }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout as string);
    });
  });
}

export function sshFs(remote: string): FsOps {
  return {
    async read(p) {
      try { return await sshExec(remote, `cat ${JSON.stringify(p)}`); }
      catch { return null; }
    },
    async list(dir) {
      try {
        const out = await sshExec(remote, `ls -1 ${JSON.stringify(dir)}`);
        return out.split("\n").map(l => l.trim()).filter(Boolean);
      } catch { return []; }
    },
    join: posixJoin,
    dirname: posixDirname,
    relative: posixRelative,
  };
}

/**
 * Reads --ssh user@host (or --ssh=user@host) from process.argv.
 */
export function readSshFlag(): string | undefined {
  const args = process.argv;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--ssh" && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith("--ssh=")) return args[i].slice(6);
  }
  return undefined;
}

/**
 * Resolves SSH state from the --ssh flag value.
 * Supports user@host:/path and user@host (cwd resolved via pwd).
 */
export async function resolveSshState(flag: string): Promise<SshState> {
  const colonIdx = flag.indexOf(":");
  if (colonIdx !== -1) {
    const remote = flag.slice(0, colonIdx);
    const rawCwd = flag.slice(colonIdx + 1);
    const remoteCwd = (await sshExec(remote, `cd ${rawCwd} && pwd`)).trim();
    return { remote, remoteCwd };
  }
  const remoteCwd = (await sshExec(flag, "pwd")).trim();
  return { remote: flag, remoteCwd };
}

import { runGitOrThrow } from "./exec.js";

export type ChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed"
  | "untracked"
  | "unmerged";

export interface FileEntry {
  /** Path relative to repo root (the current path for renames). */
  path: string;
  /** Original path for renames/copies. */
  origPath?: string;
  /** Staged status letter from porcelain v2 (X), "." when unmodified. */
  x: string;
  /** Worktree status letter from porcelain v2 (Y), "." when unmodified. */
  y: string;
  /** True when the index differs from HEAD for this path. */
  staged: boolean;
  /** True when the worktree differs from the index for this path. */
  unstaged: boolean;
  kind: ChangeKind;
  untracked: boolean;
  unmerged: boolean;
}

export interface RepoStatus {
  branch: string | null;
  detached: boolean;
  initial: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** Working-tree changes: index-vs-HEAD and/or worktree-vs-index. */
  unstaged: FileEntry[];
  staged: FileEntry[];
}

export function kindFromCode(code: string): ChangeKind {
  switch (code) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    default:
      return "modified";
  }
}

/** Split a NUL-separated porcelain-v2 payload into records, keeping rename origPaths attached. */
function splitRecords(raw: string): string[] {
  const tokens = raw.split("\0");
  const records: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "" || tok === undefined) continue;
    if (tok.startsWith("2 ")) {
      // Rename/copy: the following token is the original path.
      const orig = tokens[++i] ?? "";
      records.push(`${tok}\0${orig}`);
    } else {
      records.push(tok);
    }
  }
  return records;
}

export async function status(): Promise<RepoStatus> {
  // `-uall` lists every file inside an untracked directory instead of collapsing
  // it to a single "dir/" entry — we want to show and stage individual files.
  const raw = await runGitOrThrow(["status", "--porcelain=v2", "--branch", "-z", "-uall"]);

  const result: RepoStatus = {
    branch: null,
    detached: false,
    initial: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    unstaged: [],
    staged: [],
  };

  for (const record of splitRecords(raw)) {
    if (record.startsWith("# ")) {
      const header = record.slice(2);
      if (header.startsWith("branch.head ")) {
        const head = header.slice("branch.head ".length);
        if (head === "(detached)") result.detached = true;
        else result.branch = head;
      } else if (header.startsWith("branch.oid ")) {
        if (header.slice("branch.oid ".length) === "(initial)") result.initial = true;
      } else if (header.startsWith("branch.upstream ")) {
        result.upstream = header.slice("branch.upstream ".length);
      } else if (header.startsWith("branch.ab ")) {
        const m = header.match(/\+(\d+) -(\d+)/);
        if (m) {
          result.ahead = Number(m[1] ?? 0);
          result.behind = Number(m[2] ?? 0);
        }
      }
      continue;
    }

    const type = record[0];

    if (type === "?") {
      const path = record.slice(2);
      result.unstaged.push({
        path,
        x: ".",
        y: "?",
        staged: false,
        unstaged: true,
        kind: "untracked",
        untracked: true,
        unmerged: false,
      });
      continue;
    }

    if (type === "!") continue; // ignored

    if (type === "1" || type === "2") {
      const parts = record.split("\0");
      const meta = parts[0] ?? "";
      const origPath = parts[1];
      const fields = meta.split(" ");
      const xy = fields[1] ?? "..";
      const x = xy[0] ?? ".";
      const y = xy[1] ?? ".";
      // For type "1": path is fields[8..]; for type "2": fields[9] is <X><score>, path is fields[10..].
      const pathStart = type === "1" ? 8 : 10;
      const path = fields.slice(pathStart).join(" ");
      const staged = x !== ".";
      const unstaged = y !== ".";
      if (staged) {
        result.staged.push({
          path,
          origPath: type === "2" ? origPath : undefined,
          x,
          y,
          staged: true,
          unstaged,
          kind: kindFromCode(x),
          untracked: false,
          unmerged: false,
        });
      }
      if (unstaged) {
        result.unstaged.push({
          path,
          origPath: type === "2" ? origPath : undefined,
          x,
          y,
          staged,
          unstaged: true,
          kind: kindFromCode(y),
          untracked: false,
          unmerged: false,
        });
      }
      continue;
    }

    if (type === "u") {
      const fields = record.split(" ");
      const path = fields.slice(10).join(" ");
      const xy = fields[1] ?? "UU";
      result.unstaged.push({
        path,
        x: xy[0] ?? "U",
        y: xy[1] ?? "U",
        staged: false,
        unstaged: true,
        kind: "unmerged",
        untracked: false,
        unmerged: true,
      });
    }
  }

  return result;
}

import { join } from "node:path";
import { getGitCwd, runGit } from "./exec.js";
import type { FileEntry } from "./status.js";

export interface BinarySizeSides {
  /** Byte size of each side, or null when that side doesn't exist (new/deleted file). */
  before: number | null;
  after: number | null;
}

/** Where one side of a binary diff lives — a git blob, or a worktree file. */
type Side = { kind: "blob"; ref: string; path: string } | { kind: "worktree"; path: string } | null;

/** Same before/after resolution `diffFile` uses for a textual diff (index vs
 *  HEAD when staged, worktree vs index otherwise). */
function resolveSides(entry: FileEntry, staged: boolean): { before: Side; after: Side } {
  if (entry.untracked) {
    return { before: null, after: { kind: "worktree", path: entry.path } };
  }

  const oldPath = entry.origPath ?? entry.path;

  if (staged) {
    // Index vs HEAD.
    return {
      before: entry.kind === "added" ? null : { kind: "blob", ref: "HEAD", path: oldPath },
      after: entry.kind === "deleted" ? null : { kind: "blob", ref: "", path: entry.path },
    };
  }

  // Worktree vs index.
  return {
    before: { kind: "blob", ref: "", path: oldPath },
    after: entry.kind === "deleted" ? null : { kind: "worktree", path: entry.path },
  };
}

/** Blob size in bytes without reading its content — cheap even for a huge file. */
async function blobSize(ref: string, path: string): Promise<number | null> {
  const res = await runGit(["cat-file", "-s", `${ref}:${path}`]);
  if (res.code !== 0) return null;
  const n = Number(res.stdout.trim());
  return Number.isFinite(n) ? n : null;
}

function worktreeSize(path: string): number | null {
  const size = Bun.file(join(getGitCwd(), path)).size;
  return size > 0 ? size : null;
}

async function readSideSize(side: Side): Promise<number | null> {
  if (!side) return null;
  return side.kind === "blob" ? blobSize(side.ref, side.path) : worktreeSize(side.path);
}

/**
 * Before/after byte sizes for a binary diff — `git diff` never produces a
 * textual patch for one, only the "Binary files ... differ" line `diffFile`
 * turns into `FileDiff.binary`, so this is what the diff panel shows instead.
 */
export async function readBinarySizes(entry: FileEntry, staged: boolean): Promise<BinarySizeSides> {
  const sides = resolveSides(entry, staged);
  const [before, after] = await Promise.all([
    readSideSize(sides.before),
    readSideSize(sides.after),
  ]);
  return { before, after };
}

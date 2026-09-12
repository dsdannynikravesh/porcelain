import { runGitOrThrow } from "./exec.js";
import type { FileEntry } from "./status.js";

/** Stage all worktree changes for a path (including deletions and untracked). */
export async function stageFile(entry: FileEntry): Promise<void> {
  await runGitOrThrow(["add", "--", entry.path]);
}

/** Remove a path's changes from the index, leaving the worktree untouched. */
export async function unstageFile(entry: FileEntry): Promise<void> {
  // `restore --staged` works whether or not HEAD exists in modern git; fall back to reset.
  const res = await runGitOrThrow(["reset", "--quiet", "HEAD", "--", entry.path]).catch(
    () => runGitOrThrow(["rm", "--cached", "-r", "--", entry.path]),
  );
  void res;
}

export async function stageAll(): Promise<void> {
  await runGitOrThrow(["add", "-A"]);
}

export async function unstageAll(): Promise<void> {
  await runGitOrThrow(["reset", "--quiet"]).catch(() => runGitOrThrow(["rm", "-r", "--cached", "."]));
}

/** Discard worktree changes for a tracked path, or delete an untracked file. */
export async function discardFile(entry: FileEntry): Promise<void> {
  if (entry.untracked) {
    await runGitOrThrow(["clean", "-f", "--", entry.path]);
    return;
  }
  await runGitOrThrow(["checkout", "--", entry.path]);
}

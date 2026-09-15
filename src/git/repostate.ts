import { existsSync } from "node:fs";
import { join } from "node:path";
import { getGitCwd, runGit } from "./exec.js";

export type RepoState = "clean" | "merging" | "rebasing";

export interface RepoStateOutcome {
  ok: boolean;
  message: string;
}

async function resolveGitDir(): Promise<string | null> {
  const res = await runGit(["rev-parse", "--git-dir"]);
  if (res.code !== 0) return null;
  const dir = res.stdout.trim();
  // --git-dir is usually relative ("​.git") to whatever cwd git ran in —
  // resolve it against that same cwd so this still works for a worktree's
  // absolute path too (returned as-is when already absolute).
  return dir.startsWith("/") ? dir : join(getGitCwd(), dir);
}

/** Detected from the marker files git itself uses — no state we track ourselves. */
export async function getRepoState(): Promise<RepoState> {
  const dir = await resolveGitDir();
  if (!dir) return "clean";
  if (existsSync(join(dir, "rebase-merge")) || existsSync(join(dir, "rebase-apply"))) {
    return "rebasing";
  }
  if (existsSync(join(dir, "MERGE_HEAD"))) {
    return "merging";
  }
  return "clean";
}

// Both rebase and merge conflicts print their real news ("CONFLICT: ...",
// "error: ...") among "hint:" lines of secondary advice — same shape as the
// push/pull/squash summaries elsewhere in this app.
function summarize(output: string): string {
  const lines = output
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.find((l) => /^(CONFLICT|error|fatal)/i.test(l)) ?? lines[0] ?? "";
}

export async function continueRebase(): Promise<RepoStateOutcome> {
  // An interactive rebase can still invoke the commit-message editor during
  // --continue. The TUI owns the terminal, so reuse Git's prepared message
  // instead of leaving a hidden editor process waiting forever.
  const res = await runGit(["rebase", "--continue"], { env: { GIT_EDITOR: "true" } });
  if (res.code !== 0) {
    return {
      ok: false,
      message: summarize(res.stderr || res.stdout) || "rebase --continue failed",
    };
  }
  return { ok: true, message: summarize(res.stderr || res.stdout) || "Rebase continued" };
}

export async function abortRebase(): Promise<RepoStateOutcome> {
  const res = await runGit(["rebase", "--abort"]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "rebase --abort failed" };
  }
  return { ok: true, message: "Rebase aborted — back to where you started" };
}

export async function continueMerge(): Promise<RepoStateOutcome> {
  // --no-edit: finishes the merge commit with git's default message, same
  // reasoning as everywhere else here that never opens an editor.
  const res = await runGit(["commit", "--no-edit"]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "commit failed" };
  }
  return { ok: true, message: summarize(res.stdout) || "Merge completed" };
}

export async function abortMerge(): Promise<RepoStateOutcome> {
  const res = await runGit(["merge", "--abort"]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "merge --abort failed" };
  }
  return { ok: true, message: "Merge aborted — back to where you started" };
}

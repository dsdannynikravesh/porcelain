import { GitError, runGit, runGitOrThrow } from "./exec.js";

export interface CommitOptions {
  amend?: boolean;
}

export interface CommitOutcome {
  ok: boolean;
  /** Short hash + subject on success, or an error message on failure. */
  message: string;
}

export async function commit(message: string, opts: CommitOptions = {}): Promise<CommitOutcome> {
  const trimmed = message.trim();
  if (!trimmed && !opts.amend) {
    return { ok: false, message: "Empty commit message" };
  }

  const args = ["commit"];
  if (opts.amend) args.push("--amend");
  args.push("-m", trimmed || " ");

  const res = await runGit(args);
  if (res.code !== 0) {
    return {
      ok: false,
      message: (res.stderr || res.stdout).trim().split("\n")[0] ?? "commit failed",
    };
  }

  const summary = await runGit(["log", "-1", "--pretty=%h %s"]);
  return { ok: true, message: summary.stdout.trim() || "committed" };
}

/** Subject + body of HEAD, for pre-filling an amend. */
export async function lastCommitMessage(): Promise<string> {
  try {
    return (await runGitOrThrow(["log", "-1", "--pretty=%B"])).trimEnd();
  } catch (err) {
    if (err instanceof GitError) return "";
    throw err;
  }
}

/** True when there is anything staged to commit. */
export async function hasStagedChanges(): Promise<boolean> {
  const res = await runGit(["diff", "--cached", "--quiet"]);
  return res.code !== 0;
}

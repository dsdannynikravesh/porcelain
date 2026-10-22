import { runGit } from "./exec.js";

export interface RevertOutcome {
  ok: boolean;
  message: string;
}

// A conflicting revert prints "CONFLICT (content): ..." among "hint:" lines,
// same shape as merge/rebase — the repo is then left in the "reverting"
// state, which getRepoState() picks up and the conflict dialog takes over.
function summarize(output: string): string {
  const lines = output
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.find((l) => /^(CONFLICT|error|fatal)/i.test(l)) ?? lines[0] ?? "";
}

/**
 * Adds a new commit that undoes `sha` — history-safe, unlike a reset, so it's
 * fine on commits that are already pushed. --no-edit keeps git's own
 * `Revert "<subject>"` message rather than opening an editor the TUI can't host.
 */
export async function revertCommit(sha: string): Promise<RevertOutcome> {
  const res = await runGit(["revert", "--no-edit", sha]);
  if (res.code !== 0) {
    const summary = summarize(res.stderr || res.stdout);
    // Reverting a merge needs `-m <parent>` to say which side to keep —
    // too subtle to guess, so say so plainly instead of git's terse error.
    if (/is a merge but no -m option/.test(res.stderr)) {
      return { ok: false, message: "Can't revert a merge commit from here — use git revert -m 1" };
    }
    return { ok: false, message: summary || "revert failed" };
  }
  return { ok: true, message: summarize(res.stdout) || `Reverted ${sha.slice(0, 7)}` };
}

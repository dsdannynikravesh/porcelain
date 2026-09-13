import { runGit } from "./exec.js";
import { status } from "./status.js";

export interface SquashOutcome {
  ok: boolean;
  message: string;
}

/**
 * Combine every commit from HEAD back through `baseSha` (inclusive) into one
 * new commit, via the classic soft-reset trick: move HEAD back to baseSha's
 * parent (leaving the index untouched, so everything the squashed commits
 * changed now shows as staged) and commit it as one. Requires a clean
 * working tree first — otherwise unrelated pending changes would get swept
 * into the new commit too.
 */
export async function squashToHead(baseSha: string, message: string): Promise<SquashOutcome> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, message: "Empty commit message" };

  const s = await status();
  if (s.staged.length > 0 || s.unstaged.length > 0) {
    return { ok: false, message: "Commit or discard your changes before squashing" };
  }

  const parentRes = await runGit(["rev-parse", `${baseSha}^`]);
  if (parentRes.code !== 0) {
    return { ok: false, message: "Can't squash through the very first commit — it has no parent" };
  }

  const resetRes = await runGit(["reset", "--soft", parentRes.stdout.trim()]);
  if (resetRes.code !== 0) {
    return {
      ok: false,
      message: (resetRes.stderr || resetRes.stdout).trim().split("\n")[0] ?? "reset failed",
    };
  }

  const commitRes = await runGit(["commit", "-m", trimmed]);
  if (commitRes.code !== 0) {
    return {
      ok: false,
      message: (commitRes.stderr || commitRes.stdout).trim().split("\n")[0] ?? "commit failed",
    };
  }

  const summary = await runGit(["log", "-1", "--pretty=%h %s"]);
  return { ok: true, message: summary.stdout.trim() || "squashed" };
}

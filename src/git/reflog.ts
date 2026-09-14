import { runGit, runGitOrThrow } from "./exec.js";
import { status } from "./status.js";

export interface ReflogEntry {
  sha: string;
  shortSha: string;
  /** git's own reflog subject, e.g. "commit: fix typo" or "checkout: moving from a to b". */
  action: string;
  relativeDate: string;
}

export interface UndoOutcome {
  ok: boolean;
  message: string;
}

const FIELD_SEP = "\x1f";

/** The last `limit` places HEAD has pointed, newest first — this branch's undo history. */
export async function listReflog(limit = 30): Promise<ReflogEntry[]> {
  const raw = await runGitOrThrow([
    "reflog",
    `-n${limit}`,
    `--pretty=format:%H${FIELD_SEP}%h${FIELD_SEP}%gs${FIELD_SEP}%cr`,
  ]);
  return raw
    .split("\n")
    .map((line) => {
      const [sha, shortSha, action, relativeDate] = line.split(FIELD_SEP);
      return {
        sha: sha ?? "",
        shortSha: shortSha ?? "",
        action: action ?? "",
        relativeDate: relativeDate ?? "",
      };
    })
    .filter((e) => e.sha);
}

/**
 * Moves HEAD back to `sha` without touching the index or working tree, so
 * everything since then comes back as staged changes — nothing is lost, it's
 * just uncommitted. Refuses (like every other mutation here) if the working
 * tree isn't clean, so unrelated pending changes can't get swept in.
 */
export async function resetSoftTo(sha: string): Promise<UndoOutcome> {
  const s = await status();
  if (s.staged.length > 0 || s.unstaged.length > 0) {
    return { ok: false, message: "Commit or discard your changes before undoing" };
  }

  const res = await runGit(["reset", "--soft", sha]);
  if (res.code !== 0) {
    const line = (res.stderr || res.stdout).trim().split("\n")[0] ?? "reset failed";
    return { ok: false, message: line };
  }
  return { ok: true, message: `Reset to ${sha.slice(0, 7)}` };
}

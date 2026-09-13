import { runGit } from "./exec.js";

export interface PullOutcome {
  ok: boolean;
  /** git's own summary line on success, or the useful line of an error on failure. */
  message: string;
}

// Unlike push, a rebasing pull's stderr has progress noise: a "Rebasing
// (n/m)" line git writes followed by a bare \r (no \n) before overwriting it
// with the real status, plus the usual "From <remote>" / "hint:" lines. The
// news is whichever line actually says error/CONFLICT, or otherwise the last
// line left once the noise is dropped.
function summarize(stderr: string): string {
  const lines = stderr
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("From ") && !l.startsWith("hint:") && !/^Rebasing \(\d+\/\d+\)$/.test(l));
  return lines.find((l) => /^(error|CONFLICT)/i.test(l)) ?? lines.at(-1) ?? "";
}

export async function pull(): Promise<PullOutcome> {
  // --rebase replays local commits on top instead of a merge commit, keeping
  // history linear. --autostash means uncommitted changes don't block it —
  // git stashes them, rebases, then pops the stash back automatically.
  const res = await runGit(["pull", "--rebase", "--autostash"]);
  // git's "nothing to do" message ("Already up to date.") is one of the few
  // things it puts on stdout instead of stderr, so fall back to it.
  const summary = summarize(res.stderr) || res.stdout.trim();

  if (res.code !== 0) {
    return { ok: false, message: summary || "pull failed" };
  }

  return { ok: true, message: summary || "pulled" };
}

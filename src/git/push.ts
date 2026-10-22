import { runGit } from "./exec.js";

export interface PushOutcome {
  ok: boolean;
  /** git's own summary line on success, or the useful line of an error on failure. */
  message: string;
}

// git push's stderr always leads with a "To <remote>" line, and a failure
// adds trailing "hint:" lines of secondary advice. The actual news (the
// ref-update summary, or the "! [rejected] ... (fetch first)" reason) is
// whatever's left once those are dropped.
function summarize(stderr: string): string {
  const lines = stderr
    .trim()
    .split("\n")
    .map((l) => l.trim());
  return lines.find((l) => l && !l.startsWith("To ") && !l.startsWith("hint:")) ?? lines[0] ?? "";
}

export interface PushOptions {
  /**
   * `--force-with-lease` instead of a plain push — needed after amending or
   * rebasing a commit that's already on the remote. Unlike plain `--force`,
   * git still refuses if the remote moved since your last fetch (someone
   * else pushed), so it can't silently clobber work you haven't seen.
   */
  forceWithLease?: boolean;
  /**
   * `-u <remote> <branch>` — publishes a branch that has no upstream yet
   * (a bare `git push` refuses with "has no upstream branch") and records
   * the tracking relationship so later pushes/pulls just work.
   */
  setUpstream?: { remote: string; branch: string };
}

export async function push(opts: PushOptions = {}): Promise<PushOutcome> {
  const args = ["push"];
  if (opts.forceWithLease) args.push("--force-with-lease");
  if (opts.setUpstream) args.push("-u", opts.setUpstream.remote, opts.setUpstream.branch);
  const res = await runGit(args);
  // git puts all of its human-facing output on stderr, win or lose — stdout
  // is reserved for machine-parseable data push doesn't produce.
  const summary = summarize(res.stderr);

  if (res.code !== 0) {
    return { ok: false, message: summary || "push failed" };
  }

  return { ok: true, message: summary || "pushed" };
}

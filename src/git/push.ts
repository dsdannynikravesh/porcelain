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

export async function push(): Promise<PushOutcome> {
  const res = await runGit(["push"]);
  // git puts all of its human-facing output on stderr, win or lose — stdout
  // is reserved for machine-parseable data push doesn't produce.
  const summary = summarize(res.stderr);

  if (res.code !== 0) {
    return { ok: false, message: summary || "push failed" };
  }

  return { ok: true, message: summary || "pushed" };
}

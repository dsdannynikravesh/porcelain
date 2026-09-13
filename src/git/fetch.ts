import { runGit } from "./exec.js";

export interface FetchOutcome {
  ok: boolean;
  message: string;
}

// A no-op fetch prints nothing at all (empty stdout and stderr) — unlike
// push/pull, there's no "Already up to date." message to fall back to, so
// the caller supplies its own idle text. When there IS something, it's on
// stderr behind the usual "From <remote>" line. A hard failure (bad remote,
// no network) leads with a "fatal:"/"error:" line instead, and that one's
// worth preferring over whatever multi-line advice git tacks on after it.
function summarize(stderr: string): string {
  const lines = stderr
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const fatal = lines.find((l) => /^(fatal|error):/i.test(l));
  if (fatal) return fatal;
  const useful = lines.filter((l) => !l.startsWith("From ") && !l.startsWith("hint:"));
  return useful.at(-1) ?? lines[0] ?? "";
}

export async function fetch(): Promise<FetchOutcome> {
  const res = await runGit(["fetch"]);
  const summary = summarize(res.stderr);

  if (res.code !== 0) {
    return { ok: false, message: summary || "fetch failed" };
  }

  return { ok: true, message: summary || "up to date" };
}

import { runGit } from "./exec.js";

export interface Hunk {
  /** The "@@ -a,b +c,d @@ ..." header line for this hunk. */
  header: string;
  /** Body lines (each starting with ' ', '+', or '-'), header not included. */
  lines: string[];
}

export interface HunkOutcome {
  ok: boolean;
  message: string;
}

/** Split a unified diff into its hunks (the parts after each "@@ ... @@" line). */
export function parseHunks(patch: string): Hunk[] {
  const lines = patch.split("\n");
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith("@@")) i++;
  while (i < lines.length) {
    const header = lines[i]!;
    i++;
    const body: string[] = [];
    while (i < lines.length && !lines[i]!.startsWith("@@")) {
      body.push(lines[i]!);
      i++;
    }
    hunks.push({ header, lines: body });
  }
  return hunks;
}

/** Everything before the first hunk — the "diff --git"/"---"/"+++" file header lines. */
function preambleOf(patch: string): string[] {
  const out: string[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) break;
    out.push(line);
  }
  return out;
}

/**
 * Rebuild a standalone, `git apply`-able patch containing just one hunk from
 * a file's full diff — same file header, single hunk. The hunk's own
 * `@@ -a,b +c,d @@` counts are already correct on their own (they came
 * straight out of a real `git diff`), so no recounting is needed.
 */
function buildHunkPatch(patch: string, hunk: Hunk): string {
  const text = [...preambleOf(patch), hunk.header, ...hunk.lines].join("\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

// `git apply` failures are short and to the point already — no "hint:" noise
// to filter here, unlike the porcelain commands elsewhere in this app.
function summarize(output: string): string {
  const lines = output
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.find((l) => /^(error|fatal)/i.test(l)) ?? lines[0] ?? "";
}

/** Stage one hunk out of a file's unstaged (worktree-vs-index) diff. */
export async function stageHunk(unstagedPatch: string, hunk: Hunk): Promise<HunkOutcome> {
  const patch = buildHunkPatch(unstagedPatch, hunk);
  const res = await runGit(["apply", "--cached", "-"], { input: patch });
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "Could not stage hunk" };
  }
  return { ok: true, message: "Staged hunk" };
}

/** Unstage one hunk out of a file's staged (index-vs-HEAD) diff, leaving the worktree alone. */
export async function unstageHunk(stagedPatch: string, hunk: Hunk): Promise<HunkOutcome> {
  const patch = buildHunkPatch(stagedPatch, hunk);
  const res = await runGit(["apply", "--cached", "-R", "-"], { input: patch });
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "Could not unstage hunk" };
  }
  return { ok: true, message: "Unstaged hunk" };
}

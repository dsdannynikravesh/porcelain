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

const HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** True for the body lines a user can pick in line mode — additions and removals. */
export function isChangeLine(line: string): boolean {
  return line.startsWith("+") || line.startsWith("-");
}

/**
 * Rebuild a `git apply`-able patch for just the `selected` lines (indices
 * into `hunk.lines`) of one hunk — the same trick `git add -p`'s "e"dit mode
 * relies on. Lines left out must still describe what's actually in the
 * index, so:
 *
 * - staging (`reverse` false, applied with `--cached` to the worktree diff):
 *   an unselected `-` line is still in the index → becomes context; an
 *   unselected `+` line isn't being added → dropped.
 * - unstaging (`reverse` true, applied with `--cached -R` to the staged
 *   diff): the roles swap — an unselected `+` line stays in the index →
 *   context; an unselected `-` line isn't coming back → dropped.
 *
 * The header counts are recomputed to match. Null when nothing selected is
 * actually a change line (there'd be nothing to apply).
 */
export function buildLinePatch(
  patch: string,
  hunk: Hunk,
  selected: ReadonlySet<number>,
  reverse: boolean,
): string | null {
  const toContext = reverse ? "+" : "-";
  const body: string[] = [];
  let changes = 0;

  // One source line plus the "\ No newline" marker that may follow it — the
  // marker belongs to that line and goes (or is dropped) along with it.
  type Item = { index: number; line: string; marker?: string };
  const emit = (item: Item | undefined) => {
    if (!item) return;
    const sign = item.line[0];
    let out: string | null;
    if (selected.has(item.index)) {
      out = item.line;
      changes++;
    } else if (sign === toContext) {
      out = ` ${item.line.slice(1)}`;
    } else {
      out = null; // unselected line on the other side: not part of the result
    }
    if (out !== null) {
      body.push(out);
      if (item.marker) body.push(item.marker);
    }
  };

  // git lists a run of changes as all its removals, then all its additions
  // (-two -three +TWO +THREE). Emitting them in that order would leave an
  // unselected "-three", now context, *ahead* of a picked "+TWO" — so
  // instead pair the k-th removal with the k-th addition and interleave
  // them, putting each picked line back where the line it replaces was.
  let removals: Item[] = [];
  let additions: Item[] = [];
  let last: Item | null = null;
  const flush = () => {
    for (let k = 0; k < Math.max(removals.length, additions.length); k++) {
      emit(removals[k]);
      emit(additions[k]);
    }
    removals = [];
    additions = [];
  };

  hunk.lines.forEach((line, index) => {
    if (line === "") return; // trailing artifact of splitting on "\n"
    if (line.startsWith("\\")) {
      if (last) last.marker = line;
      else body.push(line); // follows a context line, already emitted
      return;
    }
    if (line[0] === "-" || line[0] === "+") {
      last = { index, line };
      (line[0] === "-" ? removals : additions).push(last);
    } else {
      flush();
      last = null;
      body.push(line);
    }
  });
  flush();
  if (changes === 0) return null;

  const m = HEADER_RE.exec(hunk.header);
  if (!m) return null;
  let oldStart = Number(m[1]);
  let newStart = Number(m[3]);
  const origOld = m[2] === undefined ? 1 : Number(m[2]);
  const origNew = m[4] === undefined ? 1 : Number(m[4]);
  const content = body.filter((l) => !l.startsWith("\\"));
  const oldCount = content.filter((l) => l[0] === " " || l[0] === "-").length;
  const newCount = content.filter((l) => l[0] === " " || l[0] === "+").length;
  // A zero-length side is addressed by the line *before* it ("-4,0" means
  // "after line 4"), so a side that just became empty shifts back by one.
  if (oldCount === 0 && origOld > 0) oldStart--;
  if (newCount === 0 && origNew > 0) newStart--;

  const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${m[5]}`;
  return `${[...preambleOf(patch), header, ...body].join("\n")}\n`;
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

/** Stage just the `selected` lines of one hunk out of a file's unstaged diff. */
export async function stageLines(
  unstagedPatch: string,
  hunk: Hunk,
  selected: ReadonlySet<number>,
): Promise<HunkOutcome> {
  const patch = buildLinePatch(unstagedPatch, hunk, selected, false);
  if (!patch) return { ok: false, message: "Select at least one added or removed line" };
  const res = await runGit(["apply", "--cached", "-"], { input: patch });
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "Could not stage lines" };
  }
  return { ok: true, message: `Staged ${plural(selected.size, "line")}` };
}

/** Unstage just the `selected` lines of one hunk out of a file's staged diff. */
export async function unstageLines(
  stagedPatch: string,
  hunk: Hunk,
  selected: ReadonlySet<number>,
): Promise<HunkOutcome> {
  const patch = buildLinePatch(stagedPatch, hunk, selected, true);
  if (!patch) return { ok: false, message: "Select at least one added or removed line" };
  const res = await runGit(["apply", "--cached", "-R", "-"], { input: patch });
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "Could not unstage lines" };
  }
  return { ok: true, message: `Unstaged ${plural(selected.size, "line")}` };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

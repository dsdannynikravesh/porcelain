import { runGit, runGitOrThrow } from "./exec.js";

export interface StashEntry {
  /** e.g. "stash@{0}" — the newest stash is always index 0. */
  ref: string;
  /** git's own subject line, e.g. "On main: wip: refactor auth". */
  subject: string;
  relativeDate: string;
}

export interface StashOutcome {
  ok: boolean;
  message: string;
}

const FIELD_SEP = "\x1f";

export async function listStashes(): Promise<StashEntry[]> {
  const raw = await runGitOrThrow([
    "stash",
    "list",
    `--pretty=format:%gd${FIELD_SEP}%s${FIELD_SEP}%cr`,
  ]);
  return raw
    .split("\n")
    .map((line) => {
      const [ref, subject, relativeDate] = line.split(FIELD_SEP);
      return { ref: ref ?? "", subject: subject ?? "", relativeDate: relativeDate ?? "" };
    })
    .filter((s) => s.ref);
}

// A conflict during pop/apply prints its real news ("CONFLICT (content): ...")
// buried among "On branch ..." status-dump noise, and — unlike push/pull —
// git puts all of this on stdout even on failure, with stderr empty.
function summarize(output: string): string {
  const lines = output
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.find((l) => /^(CONFLICT|error|fatal)/i.test(l)) ?? lines[0] ?? "";
}

/** Stash everything — staged, unstaged, and untracked — leaving a clean working tree. */
export async function stashPush(message?: string): Promise<StashOutcome> {
  const args = ["stash", "push", "--include-untracked"];
  if (message) args.push("-m", message);
  const res = await runGit(args);
  const summary = summarize(res.stderr || res.stdout);

  if (res.code !== 0) {
    return { ok: false, message: summary || "stash failed" };
  }
  // "No local changes to save" is git's own wording for the no-op case —
  // worth surfacing verbatim rather than claiming something was stashed.
  return { ok: true, message: summary || "stashed" };
}

export async function stashPop(ref: string): Promise<StashOutcome> {
  const res = await runGit(["stash", "pop", ref]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "pop failed" };
  }
  return { ok: true, message: `Popped ${ref}` };
}

export async function stashApply(ref: string): Promise<StashOutcome> {
  const res = await runGit(["stash", "apply", ref]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "apply failed" };
  }
  return { ok: true, message: `Applied ${ref}` };
}

export async function stashDrop(ref: string): Promise<StashOutcome> {
  const res = await runGit(["stash", "drop", ref]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "drop failed" };
  }
  return { ok: true, message: `Dropped ${ref}` };
}

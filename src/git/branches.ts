import { runGit, runGitOrThrow } from "./exec.js";

export interface Branch {
  /** For a remote branch, this is the full remote-qualified name (e.g. "origin/feature"). */
  name: string;
  current: boolean;
  /** True for a remote-tracking branch with no local branch of its own yet. */
  remote: boolean;
}

export interface SwitchOutcome {
  ok: boolean;
  message: string;
}

const FIELD_SEP = "\x1f";

/** The name to `git switch` to for checking out `branch` — for a remote branch,
 *  that's its short name with the leading "<remote>/" stripped, which git's own
 *  DWIM checkout resolves back to that remote and creates a local tracking branch. */
export function checkoutName(branch: Branch): string {
  if (!branch.remote) return branch.name;
  const slash = branch.name.indexOf("/");
  return slash === -1 ? branch.name : branch.name.slice(slash + 1);
}

/**
 * Local branches, plus any remote-tracking branch that isn't already checked
 * out locally under the same name (checking one out via `checkoutName` above
 * creates that local branch, same as `git switch <name>` would from the CLI).
 */
export async function listBranches(): Promise<Branch[]> {
  const localRaw = await runGitOrThrow(["branch", `--format=%(HEAD)${FIELD_SEP}%(refname:short)`]);
  const local: Branch[] = localRaw
    .split("\n")
    .map((line) => {
      const [head, name] = line.split(FIELD_SEP);
      return { name: name ?? "", current: head === "*", remote: false };
    })
    .filter((b) => b.name);
  const localNames = new Set(local.map((b) => b.name));

  const remoteRaw = await runGitOrThrow([
    "branch",
    "-r",
    `--format=%(refname:short)${FIELD_SEP}%(symref)`,
  ]);
  const remote: Branch[] = remoteRaw
    .split("\n")
    .map((line) => {
      const [name, symref] = line.split(FIELD_SEP);
      return { name: name ?? "", symref: symref ?? "" };
    })
    // Drop the "<remote>/HEAD" pointer (git shows it with a non-empty symref,
    // distinct from a real branch ref) and anything already tracked locally.
    .filter((b) => b.name && !b.symref)
    .map((b): Branch => ({ name: b.name, current: false, remote: true }))
    .filter((b) => !localNames.has(checkoutName(b)));

  return [...local, ...remote];
}

function summarize(output: string): string {
  return (
    output
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("hint:")) ?? "failed"
  );
}

export async function switchBranch(name: string): Promise<SwitchOutcome> {
  const res = await runGit(["switch", name]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) };
  }
  return { ok: true, message: `Switched to ${name}` };
}

/** Creates `name` off the current HEAD and switches to it. */
export async function createBranch(name: string): Promise<SwitchOutcome> {
  const res = await runGit(["switch", "-c", name]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) };
  }
  return { ok: true, message: `Created and switched to ${name}` };
}

/**
 * Merges `name` into the current branch. `--no-edit` throughout this app
 * means never opening an editor, same reasoning as `continueMerge` in
 * repostate.ts — a conflict here is a normal, git-created `MERGE_HEAD`
 * pause, which the conflict banner (feature #2) picks up on its own.
 */
export async function mergeBranch(name: string): Promise<SwitchOutcome> {
  const res = await runGit(["merge", "--no-edit", name]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) };
  }
  return { ok: true, message: summarize(res.stdout) || `Merged ${name}` };
}

/**
 * `-d` (safe delete) — git itself refuses if the branch isn't fully merged,
 * is currently checked out, or doesn't exist, so there's no separate
 * "are you sure" logic to duplicate here beyond the usual Confirm dialog.
 */
export async function deleteBranch(name: string): Promise<SwitchOutcome> {
  const res = await runGit(["branch", "-d", name]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) };
  }
  return { ok: true, message: summarize(res.stdout) || `Deleted ${name}` };
}

import { runGit, runGitOrThrow } from "./exec.js";

export interface Branch {
  name: string;
  current: boolean;
}

export interface SwitchOutcome {
  ok: boolean;
  message: string;
}

const FIELD_SEP = "\x1f";

/** Local branches only — switching to a remote-tracking ref is a separate concern. */
export async function listBranches(): Promise<Branch[]> {
  const raw = await runGitOrThrow(["branch", `--format=%(HEAD)${FIELD_SEP}%(refname:short)`]);
  return raw
    .split("\n")
    .map((line) => {
      const [head, name] = line.split(FIELD_SEP);
      return { name: name ?? "", current: head === "*" };
    })
    .filter((b) => b.name);
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

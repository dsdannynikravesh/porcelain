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

export async function switchBranch(name: string): Promise<SwitchOutcome> {
  const res = await runGit(["switch", name]);
  if (res.code !== 0) {
    const line = (res.stderr || res.stdout).trim().split("\n")[0] ?? "switch failed";
    return { ok: false, message: line };
  }
  return { ok: true, message: `Switched to ${name}` };
}

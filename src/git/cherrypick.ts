import { runGit } from "./exec.js";

export interface CherryPickOutcome {
  ok: boolean;
  message: string;
}

// Same CONFLICT-among-hints shape as revert; a stopped cherry-pick leaves
// CHERRY_PICK_HEAD behind, which the conflict dialog picks up from there.
function summarize(output: string): string {
  const lines = output
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.find((l) => /^(CONFLICT|error|fatal)/i.test(l)) ?? lines[0] ?? "";
}

/** Applies each of `shas` on top of HEAD, in the order given (pass them oldest-first). */
export async function cherryPick(shas: string[]): Promise<CherryPickOutcome> {
  if (shas.length === 0) return { ok: false, message: "No commits selected" };
  const res = await runGit(["cherry-pick", ...shas]);
  if (res.code !== 0) {
    return { ok: false, message: summarize(res.stderr || res.stdout) || "cherry-pick failed" };
  }
  return {
    ok: true,
    message: `Cherry-picked ${shas.length} commit${shas.length === 1 ? "" : "s"}`,
  };
}

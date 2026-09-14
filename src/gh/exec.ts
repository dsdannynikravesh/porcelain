import { spawn } from "node:child_process";

export interface GHResult {
  stdout: string;
  stderr: string;
  code: number;
}

let cachedCwd = process.cwd();

/** Directory every gh command runs in. Set once at startup to the repo root. */
export function setGHCwd(dir: string): void {
  cachedCwd = dir;
}

export function getGHCwd(): string {
  return cachedCwd;
}

export function runGH(
  args: string[],
  opts: { cwd?: string; input?: string } = {},
): Promise<GHResult> {
  return new Promise((resolve, reject) => {
    // No GIT_OPTIONAL_LOCKS here — that's a git-specific env var, meaningless
    // to the gh CLI (this spawns "gh", not "git").
    const child = spawn("gh", args, { cwd: opts.cwd ?? cachedCwd });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));

    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

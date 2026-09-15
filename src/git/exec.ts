import { spawn } from "node:child_process";

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class GitError extends Error {
  constructor(
    public readonly args: string[],
    public readonly result: GitResult,
  ) {
    super(
      `git ${args.join(" ")} exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`,
    );
    this.name = "GitError";
  }
}

let cachedCwd = process.cwd();

/** Directory every git command runs in. Set once at startup to the repo root. */
export function setGitCwd(dir: string): void {
  cachedCwd = dir;
}

export function getGitCwd(): string {
  return cachedCwd;
}

/**
 * Run a git command. Resolves with stdout/stderr/code for any exit status;
 * use `runGitOrThrow` when a non-zero exit should be an error.
 */
export function runGit(
  args: string[],
  opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: opts.cwd ?? cachedCwd,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...opts.env },
    });

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

export async function runGitOrThrow(
  args: string[],
  opts: { cwd?: string; input?: string } = {},
): Promise<string> {
  const result = await runGit(args, opts);
  if (result.code !== 0) throw new GitError(args, result);
  return result.stdout;
}

/** Resolve the repository root for `dir`, or null if it is not inside a work tree. */
export async function findRepoRoot(dir: string): Promise<string | null> {
  const result = await runGit(["rev-parse", "--show-toplevel"], { cwd: dir });
  if (result.code !== 0) return null;
  return result.stdout.trim() || null;
}

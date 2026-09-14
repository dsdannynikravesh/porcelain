import { spawn } from "node:child_process";

export interface CopilotExecResult {
  stdout: string;
  stderr: string;
  code: number;
  /** True if the process was killed for running past the timeout — `code`
   *  is meaningless in that case. */
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Runs `gh copilot -- <args>` — the `gh` CLI extension that wraps GitHub's
 * `copilot` binary, so this rides the same auth the rest of this app already
 * uses `gh` for (no separate `copilot login`).
 *
 * Kills the process if it runs past `timeoutMs`: an LLM call across a
 * network this app doesn't control shouldn't be able to hang the UI forever.
 */
export function runGHCopilot(
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<CopilotExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["copilot", "--", ...args], { cwd: opts.cwd });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 0, timedOut });
    });
  });
}

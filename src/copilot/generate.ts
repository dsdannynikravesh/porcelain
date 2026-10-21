import { runGHCopilot } from "./exec.js";
import { parseGeneratedCommitMessage } from "./parse.js";
import { buildCommitMessagePrompt } from "./prompt.js";

export type GenerateCommitMessageOutcome =
  | { ok: true; title: string; description: string }
  | { ok: false; message: string };

/**
 * `gh copilot -- <copilot-cli flags>`. The current Copilot CLI's prompt mode
 * writes its final answer directly to stdout. `--no-custom-instructions`
 * keeps a repo's own instructions from mixing into a prompt this app already
 * fully controls. The child process's `cwd` is set by `runGHCopilot`, so no
 * CLI directory flag is necessary.
 */
function buildArgs(prompt: string, model: string | undefined): string[] {
  const args = ["-p", prompt, "--allow-all-tools", "--no-custom-instructions"];
  if (model) args.push("--model", model);
  return args;
}

/** Overridable per-machine without a rebuild. Defaults to `auto` (Copilot
 * picks) because which named models exist varies by account and plan — an
 * unavailable one (e.g. `gpt-5`) makes the CLI fail before it reads the
 * prompt. */
function defaultModel(): string | undefined {
  return process.env.PORCELAIN_COPILOT_MODEL || "auto";
}

/** Generates a commit title/description from a diff via `gh copilot`. Never
 *  throws — every failure mode (missing `gh`, not logged into Copilot, a
 *  timeout, a malformed response) comes back as a normal `{ok: false}`
 *  outcome for the caller to toast. */
export async function generateCommitMessage(
  diff: string,
  opts: { cwd?: string } = {},
): Promise<GenerateCommitMessageOutcome> {
  const prompt = buildCommitMessagePrompt(diff);
  const args = buildArgs(prompt, defaultModel());

  let res: Awaited<ReturnType<typeof runGHCopilot>>;
  try {
    res = await runGHCopilot(args, { cwd: opts.cwd });
  } catch (err) {
    const notFound =
      typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
    return {
      ok: false,
      message: notFound
        ? "gh CLI not found — install it to use this"
        : err instanceof Error
          ? err.message
          : String(err),
    };
  }

  if (res.timedOut) {
    return { ok: false, message: "Copilot took too long to respond — try again." };
  }

  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim();
    const needsLogin = /\blogin\b/i.test(detail) || /\bnot authenticated\b/i.test(detail);
    return {
      ok: false,
      message: needsLogin
        ? "GitHub Copilot isn't signed in — run `gh auth login` first."
        : detail || `gh copilot exited with code ${res.code}`,
    };
  }

  try {
    const message = parseGeneratedCommitMessage(res.stdout);
    return { ok: true, ...message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

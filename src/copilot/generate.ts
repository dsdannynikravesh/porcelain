import { runGHCopilot } from "./exec.js";
import { parseGeneratedCommitMessage } from "./parse.js";
import { buildCommitMessagePrompt } from "./prompt.js";

export type GenerateCommitMessageOutcome =
  | { ok: true; title: string; description: string }
  | { ok: false; message: string };

/**
 * `gh copilot -- <copilot-cli flags>`. `-s` and `--output-format text`
 * suppress the banner/decoration so stdout is just the model's answer;
 * `--stream off` returns one final blob instead of incremental chunks;
 * `--no-custom-instructions` keeps a repo's own copilot-instructions.md from
 * mixing into a prompt this app already fully controls. Same flags this
 * author's earlier `gh-copilot-commit` tool settled on for this exact task.
 */
function buildArgs(prompt: string, cwd: string | undefined, model: string | undefined): string[] {
  const args = [
    "-p",
    prompt,
    "-s",
    "--output-format",
    "text",
    "--stream",
    "off",
    "--no-custom-instructions",
  ];
  if (cwd) args.push("-C", cwd);
  if (model) args.push("--model", model);
  return args;
}

/** Overridable per-machine without a rebuild; `gpt-5-mini` is fast and cheap
 *  enough for a short JSON summary — the default this author's prior
 *  `gh-copilot-commit` tool already settled on for this exact task. */
function defaultModel(): string | undefined {
  return process.env.PORCELAIN_COPILOT_MODEL || "gpt-5-mini";
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
  const args = buildArgs(prompt, opts.cwd, defaultModel());

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
        ? "GitHub Copilot isn't signed in — run `gh copilot -- login` (or `copilot login`) first."
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

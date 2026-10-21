import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CopilotClient, RuntimeConnection } from "@github/copilot-sdk";
import { parseGeneratedCommitMessage } from "./parse.js";
import { buildCommitMessageUserPrompt, COMMIT_MESSAGE_SYSTEM_PROMPT } from "./prompt.js";

export type GenerateCommitMessageOutcome =
  | { ok: true; title: string; description: string }
  | { ok: false; message: string };

const REQUEST_TIMEOUT_MS = 60_000;

/** Overridable per-machine without a rebuild. Defaults to `auto` (Copilot
 * picks) because which named models exist varies by account and plan — an
 * unavailable one (e.g. `gpt-5`) makes the session fail before it reads the
 * prompt. */
function defaultModel(): string | undefined {
  return process.env.PORCELAIN_COPILOT_MODEL || "auto";
}

/**
 * Locates the Copilot CLI runtime binary that the SDK speaks JSON-RPC to
 * over stdio. `gh copilot` already downloads and manages this exact binary
 * (and the login state that comes with it), so reusing its path means
 * porcelain rides the same install instead of needing its own.
 * `COPILOT_CLI_PATH` (the SDK's own env var) overrides it for anyone running
 * a different install.
 */
function resolveCopilotCliPath(): string | undefined {
  if (process.env.COPILOT_CLI_PATH) return process.env.COPILOT_CLI_PATH;
  const ghManaged = join(
    homedir(),
    ".local",
    "share",
    "gh",
    "copilot",
    process.platform === "win32" ? "copilot.exe" : "copilot",
  );
  return existsSync(ghManaged) ? ghManaged : undefined;
}

function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/\blogin\b/i.test(message) || /\bnot authenticated\b/i.test(message)) {
    return "GitHub Copilot isn't signed in — run `gh auth login` first.";
  }
  return message;
}

/**
 * Generates a commit title/description from a diff via the Copilot SDK — a
 * single JSON-RPC session over stdio to the `copilot` runtime binary. This
 * is the same transport GitHub Desktop's own commit-message feature uses
 * (`@github/copilot-sdk`, `CopilotClient.createSession`), instead of
 * shelling out to `gh copilot`'s non-interactive prompt mode once per call.
 * Skipping the CLI's own text UX — argument reparsing, the stats banner,
 * and the on-disk session/resume file it writes for every invocation — is
 * most of the latency difference versus the CLI-shelling approach.
 *
 * No tools are made available (`availableTools: []`) and permission
 * requests are auto-rejected: summarizing a diff needs no tool access, and
 * disabling the tool-permission subsystem entirely is both safer and
 * removes a chunk of per-call setup work.
 *
 * Never throws — every failure mode (runtime not found, not logged in, a
 * timeout, a malformed response) comes back as a normal `{ok: false}`
 * outcome for the caller to toast.
 */
export async function generateCommitMessage(
  diff: string,
  opts: { cwd?: string } = {},
): Promise<GenerateCommitMessageOutcome> {
  const cliPath = resolveCopilotCliPath();
  if (!cliPath) {
    return {
      ok: false,
      message: "Copilot CLI not found — run `gh copilot` once to install it.",
    };
  }

  const client = new CopilotClient({
    connection: RuntimeConnection.forStdio({ path: cliPath }),
    workingDirectory: opts.cwd,
  });

  try {
    const session = await client.createSession({
      model: defaultModel(),
      systemMessage: { mode: "append", content: COMMIT_MESSAGE_SYSTEM_PROMPT },
      availableTools: [],
      enableSessionStore: false,
      enableSkills: false,
      enableHostGitOperations: false,
      onPermissionRequest: async () => ({ kind: "reject" }),
    });

    try {
      const response = await session.sendAndWait(
        { prompt: buildCommitMessageUserPrompt(diff) },
        REQUEST_TIMEOUT_MS,
      );

      if (!response?.data.content) {
        return { ok: false, message: "Copilot took too long to respond — try again." };
      }

      const message = parseGeneratedCommitMessage(response.data.content);
      return { ok: true, ...message };
    } finally {
      await session.disconnect().catch(() => {});
    }
  } catch (err) {
    return { ok: false, message: describeError(err) };
  } finally {
    client.stop().catch(() => {});
  }
}

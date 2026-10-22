import { existsSync, realpathSync } from "node:fs";
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
 * The SDK ships the Copilot runtime itself, in the optional
 * `@github/copilot-sdk-<platform>` package, and by default unpacks and runs
 * that — no `gh copilot` install needed. That package can't be reached from
 * inside a `bun build --compile` binary's virtual filesystem, though, so
 * scripts/build.sh copies it into the `.assets` directory next to the
 * executable (same as OpenTUI's worker); point the SDK at that copy when it's
 * there. `COPILOT_CLI_PATH` (read by the SDK itself) still overrides both.
 */
function compiledRuntimePath(): string | undefined {
  if (process.env.COPILOT_CLI_PATH) return undefined;
  const platform = `${process.platform}-${process.arch}`;
  const wrapper = process.platform === "win32" ? "copilot-runtime.exe" : "copilot-runtime";
  let execPath: string;
  try {
    execPath = realpathSync(process.execPath);
  } catch {
    return undefined;
  }
  const candidate = join(
    `${execPath}.assets`,
    "@github",
    `copilot-sdk-${platform}`,
    "prebuilds",
    platform,
    wrapper,
  );
  return existsSync(candidate) ? candidate : undefined;
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
 * single JSON-RPC session over stdio to the SDK's bundled Copilot runtime. This
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
 * Never throws — every failure mode (runtime missing, not logged in, a
 * timeout, a malformed response) comes back as a normal `{ok: false}`
 * outcome for the caller to toast.
 */
export async function generateCommitMessage(
  diff: string,
  opts: { cwd?: string } = {},
): Promise<GenerateCommitMessageOutcome> {
  const client = new CopilotClient({
    connection: RuntimeConnection.forStdio({ path: compiledRuntimePath() }),
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

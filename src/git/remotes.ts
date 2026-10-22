import { runGitOrThrow } from "./exec.js";

/** Names of every configured remote, in git's own order ("origin", "upstream", ...). */
export async function listRemotes(): Promise<string[]> {
  const raw = await runGitOrThrow(["remote"]);
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * The remote a brand-new branch should be published to: "origin" when it
 * exists (the overwhelmingly common case), otherwise the only remote there
 * is. Null when there are none, or several with no "origin" among them —
 * guessing between those would be a coin flip.
 */
export async function defaultPushRemote(): Promise<string | null> {
  const remotes = await listRemotes();
  if (remotes.includes("origin")) return "origin";
  return remotes.length === 1 ? remotes[0]! : null;
}

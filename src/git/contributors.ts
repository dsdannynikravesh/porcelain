import { runGit, runGitOrThrow } from "./exec.js";

export interface Contributor {
  name: string;
  email: string;
}

const FIELD_SEP = "\x1f";

/**
 * Everyone who's ever committed to this repo (local history only — no
 * GitHub API involved), most-frequent first, excluding whoever `git config
 * user.email` says you are. Used to suggest Co-authored-by candidates the
 * same way GitHub Desktop's local fallback does.
 */
export async function listContributors(): Promise<Contributor[]> {
  const [raw, selfRes] = await Promise.all([
    runGitOrThrow(["log", `--format=%an${FIELD_SEP}%ae`]),
    runGit(["config", "user.email"]),
  ]);
  const selfEmail = selfRes.code === 0 ? selfRes.stdout.trim().toLowerCase() : "";

  const byEmail = new Map<string, { name: string; email: string; count: number }>();
  for (const line of raw.split("\n")) {
    const [name, email] = line.split(FIELD_SEP);
    if (!email) continue;
    const key = email.toLowerCase();
    if (key === selfEmail) continue;
    const existing = byEmail.get(key);
    if (existing) existing.count++;
    else byEmail.set(key, { name: name || email, email, count: 1 });
  }

  return [...byEmail.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ name, email }) => ({ name, email }));
}

/** The exact trailer format git/GitHub/GitLab all recognize. */
export function coAuthorTrailer(c: Contributor): string {
  return `Co-authored-by: ${c.name} <${c.email}>`;
}

/** Appends Co-authored-by trailers, with the blank line git expects before a trailer block. */
export function withCoAuthors(message: string, coAuthors: Contributor[]): string {
  if (coAuthors.length === 0) return message;
  const trimmed = message.replace(/\s+$/, "");
  const trailers = coAuthors.map(coAuthorTrailer).join("\n");
  return trimmed ? `${trimmed}\n\n${trailers}\n` : `${trailers}\n`;
}

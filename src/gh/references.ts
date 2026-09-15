import { runGH } from "./exec.js";

export interface GitHubReference {
  number: number;
  title: string;
  kind: "issue" | "pull request";
}

interface GHReference {
  number: number;
  title: string;
}

/** Open issues and pull requests in the current repository, for commit-message completion. */
export async function listOpenReferences(): Promise<GitHubReference[]> {
  const [issues, pullRequests] = await Promise.all([
    runGH(["issue", "list", "--state", "open", "--limit", "100", "--json", "number,title"]),
    runGH(["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title"]),
  ]);

  if (issues.code !== 0 || pullRequests.code !== 0) {
    throw new Error(issues.stderr || pullRequests.stderr || "Could not load GitHub references");
  }

  const toReferences = (json: string, kind: GitHubReference["kind"]): GitHubReference[] =>
    (JSON.parse(json) as GHReference[]).map(({ number, title }) => ({ number, title, kind }));

  return [
    ...toReferences(issues.stdout, "issue"),
    ...toReferences(pullRequests.stdout, "pull request"),
  ].sort((a, b) => b.number - a.number);
}

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cherryPick } from "./cherrypick.js";
import { commit } from "./commit.js";
import { diffFile } from "./diff.js";
import { findRepoRoot, runGit, runGitOrThrow, setGitCwd } from "./exec.js";
import { listCommits } from "./log.js";
import { push } from "./push.js";
import { defaultPushRemote } from "./remotes.js";
import { abortOperation, continueOperation, getRepoState } from "./repostate.js";
import { revertCommit } from "./revert.js";
import { stageFile, unstageFile } from "./stage.js";
import { status } from "./status.js";

let repo: string;

async function git(...args: string[]) {
  await runGitOrThrow(args, { cwd: repo });
}

beforeAll(async () => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "porcelain-test-")));
  setGitCwd(repo);
  await git("init", "-q");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Test");
  await git("commit", "--allow-empty", "-q", "-m", "root");
  writeFileSync(join(repo, "a.txt"), "line1\nline2\n");
  writeFileSync(join(repo, "keep.txt"), "keep\n");
  await git("add", "-A");
  await git("commit", "-q", "-m", "add files");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

test("findRepoRoot resolves inside the work tree", async () => {
  mkdirSync(join(repo, "sub"), { recursive: true });
  const root = await findRepoRoot(join(repo, "sub"));
  expect(root).toBe(repo);
});

test("findRepoRoot returns null outside a repo", async () => {
  const root = await findRepoRoot(tmpdir());
  expect(root).toBeNull();
});

test("clean repo reports no changes", async () => {
  const s = await status();
  expect(s.branch).toBeTruthy();
  expect(s.staged).toHaveLength(0);
  expect(s.unstaged).toHaveLength(0);
});

test("modified + untracked files land in unstaged", async () => {
  writeFileSync(join(repo, "a.txt"), "line1\nCHANGED\nline2\n");
  writeFileSync(join(repo, "new.txt"), "brand new\n");
  const s = await status();
  const paths = s.unstaged.map((f) => f.path).sort();
  expect(paths).toEqual(["a.txt", "new.txt"]);
  const untracked = s.unstaged.find((f) => f.path === "new.txt");
  expect(untracked?.untracked).toBe(true);
  const mod = s.unstaged.find((f) => f.path === "a.txt");
  expect(mod?.kind).toBe("modified");
});

test("staging moves a file from unstaged to staged", async () => {
  const before = await status();
  const entry = before.unstaged.find((f) => f.path === "a.txt")!;
  await stageFile(entry);
  const after = await status();
  expect(after.staged.map((f) => f.path)).toContain("a.txt");
  expect(after.unstaged.map((f) => f.path)).not.toContain("a.txt");
});

test("unstaging moves it back", async () => {
  const s = await status();
  const entry = s.staged.find((f) => f.path === "a.txt")!;
  await unstageFile(entry);
  const after = await status();
  expect(after.staged.map((f) => f.path)).not.toContain("a.txt");
  expect(after.unstaged.map((f) => f.path)).toContain("a.txt");
});

test("diffFile returns a unified patch for a modified file", async () => {
  const s = await status();
  const entry = s.unstaged.find((f) => f.path === "a.txt")!;
  const d = await diffFile(entry, false);
  expect(d.patch).toContain("@@");
  expect(d.patch).toContain("+CHANGED");
  expect(d.filetype).toBe("txt");
});

test("diffFile synthesizes an all-added patch for untracked files", async () => {
  const s = await status();
  const entry = s.unstaged.find((f) => f.path === "new.txt")!;
  const d = await diffFile(entry, false);
  expect(d.patch).toContain("+brand new");
});

test("diffFile blanks the header-only patch for an empty new file", async () => {
  writeFileSync(join(repo, "empty.md"), "");
  const s = await status();
  const entry = s.unstaged.find((f) => f.path === "empty.md")!;
  const d = await diffFile(entry, false);
  expect(d.patch).toBe("");
  expect(d.emptyReason).toBe("new-empty-file");
});

test("commit records staged changes and reports the summary", async () => {
  await runGit(["add", "a.txt"], { cwd: repo });
  const outcome = await commit("test: change a.txt");
  expect(outcome.ok).toBe(true);
  expect(outcome.message).toContain("test: change a.txt");
  const s = await status();
  expect(s.staged).toHaveLength(0);
});

test("ahead count reflects local commits without an upstream push", async () => {
  await git("branch", "--set-upstream-to=refs/heads/main", "main").catch(() => {});
  const s = await status();
  expect(typeof s.ahead).toBe("number");
});

test("push with setUpstream publishes a new branch and tracks it", async () => {
  const remote = realpathSync(mkdtempSync(join(tmpdir(), "porcelain-remote-")));
  try {
    await runGitOrThrow(["init", "-q", "--bare"], { cwd: remote });
    expect(await defaultPushRemote()).toBeNull();
    await git("remote", "add", "origin", remote);
    expect(await defaultPushRemote()).toBe("origin");

    await git("switch", "-q", "-c", "feature/publish");
    expect((await status()).upstream).toBeNull();

    const outcome = await push({ setUpstream: { remote: "origin", branch: "feature/publish" } });
    expect(outcome.ok).toBe(true);
    expect((await status()).upstream).toBe("origin/feature/publish");
  } finally {
    await git("remote", "remove", "origin").catch(() => {});
    rmSync(remote, { recursive: true, force: true });
  }
});

async function commitFile(name: string, content: string, message: string) {
  writeFileSync(join(repo, name), content);
  await git("add", name);
  await git("commit", "-q", "-m", message);
}

test("revertCommit adds an undo commit", async () => {
  await git("stash", "-q", "-u").catch(() => {});
  await commitFile("rev.txt", "one\n", "add rev");
  await commitFile("rev.txt", "two\n", "change rev");
  const [head] = await listCommits(1);
  const outcome = await revertCommit(head!.sha);
  expect(outcome.ok).toBe(true);
  const [after] = await listCommits(1);
  expect(after!.subject).toBe('Revert "change rev"');
  expect(await Bun.file(join(repo, "rev.txt")).text()).toBe("one\n");
});

test("a conflicting revert pauses as 'reverting' and can be aborted", async () => {
  await commitFile("conf.txt", "base\n", "conf base");
  await commitFile("conf.txt", "mid\n", "conf mid");
  const [mid] = await listCommits(1);
  await commitFile("conf.txt", "top\n", "conf top");

  const outcome = await revertCommit(mid!.sha);
  expect(outcome.ok).toBe(false);
  expect(await getRepoState()).toBe("reverting");

  const aborted = await abortOperation("reverting");
  expect(aborted.ok).toBe(true);
  expect(await getRepoState()).toBe("clean");
});

test("listCommits notInHead + cherryPick bring commits over oldest-first", async () => {
  await git("switch", "-q", "-c", "pick-source");
  await commitFile("p1.txt", "1\n", "pick one");
  await commitFile("p2.txt", "2\n", "pick two");
  await git("switch", "-q", "-");

  const candidates = await listCommits(50, 0, { notInHead: "pick-source" });
  expect(candidates.map((c) => c.subject)).toEqual(["pick two", "pick one"]);

  const outcome = await cherryPick(candidates.map((c) => c.sha).reverse());
  expect(outcome.ok).toBe(true);
  const top = await listCommits(2);
  expect(top.map((c) => c.subject)).toEqual(["pick two", "pick one"]);

  // Patch-equivalent commits are now on HEAD, so --cherry-pick hides them.
  expect(await listCommits(50, 0, { notInHead: "pick-source" })).toHaveLength(0);
});

test("a conflicting cherry-pick pauses as 'cherry-picking' and continues once resolved", async () => {
  await git("switch", "-q", "-c", "pick-conflict");
  await commitFile("cp.txt", "theirs\n", "cp theirs");
  const [theirs] = await listCommits(1);
  await git("switch", "-q", "-");
  await commitFile("cp.txt", "ours\n", "cp ours");

  expect((await cherryPick([theirs!.sha])).ok).toBe(false);
  expect(await getRepoState()).toBe("cherry-picking");

  writeFileSync(join(repo, "cp.txt"), "resolved\n");
  await git("add", "cp.txt");
  expect((await continueOperation("cherry-picking")).ok).toBe(true);
  expect(await getRepoState()).toBe("clean");
  const [head] = await listCommits(1);
  expect(head!.subject).toBe("cp theirs");
});

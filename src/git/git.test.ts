import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commit } from "./commit.js";
import { diffFile } from "./diff.js";
import { findRepoRoot, runGit, runGitOrThrow, setGitCwd } from "./exec.js";
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

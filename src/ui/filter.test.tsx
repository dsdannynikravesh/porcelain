import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { runGitOrThrow, setGitCwd } from "../git/index.js";
import { App } from "./app.js";

let repo: string;
const git = (...a: string[]) => runGitOrThrow(a, { cwd: repo });

beforeAll(async () => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "porcelain-filter-")));
  setGitCwd(repo);
  await git("init", "-q");
  await git("config", "user.email", "t@e.com");
  await git("config", "user.name", "T");
  writeFileSync(join(repo, "alpha.txt"), "a\n");
  await git("add", "-A");
  await git("commit", "-qm", "feat: add alpha");
  mkdirSync(join(repo, "deep"));
  writeFileSync(join(repo, "deep", "beta.txt"), "b\n");
  await git("add", "-A");
  await git("commit", "-qm", "fix: add beta");
  writeFileSync(join(repo, "alpha.txt"), "a2\n");
  writeFileSync(join(repo, "deep", "beta.txt"), "b2\n");
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

test("`/` filters changed files and commits; Esc clears", async () => {
  const t = await testRender(<App />, { width: 110, height: 30 });
  // Poll on the clock rather than render passes: a lone ESC byte is held by
  // the input parser until its escape-sequence timeout fires (it could be the
  // start of "\x1b[A"), and under a loaded test run keys and git calls can
  // take longer than waitForFrame's fixed number of passes.
  const waitFor = async (predicate: (frame: string) => boolean) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await t.renderOnce();
      if (predicate(t.captureCharFrame())) return;
      await Bun.sleep(20);
    }
    throw new Error(`frame never matched:\n${t.captureCharFrame()}`);
  };
  const changesPane = (f: string) =>
    f
      .split("\n")
      .map((l) => l.slice(0, 26))
      .join("\n");
  await waitFor((f) => changesPane(f).includes("alpha.txt") && f.includes("beta.txt"));

  t.mockInput.pressKey("/");
  await waitFor((f) => f.includes("Filter files"));
  await t.mockInput.typeText("BETA");
  t.mockInput.pressEnter();
  await waitFor((f) => f.includes("/BETA") && !changesPane(f).includes("alpha.txt"));
  expect(changesPane(t.captureCharFrame())).toContain("beta.txt");

  t.mockInput.pressKey("ESCAPE");
  await waitFor((f) => !f.includes("/BETA") && changesPane(f).includes("alpha.txt"));

  // History: search commit messages.
  t.mockInput.pressKey("t");
  // Subjects are truncated in the narrow commits pane, so match "· fix:" etc.
  await waitFor((f) => f.includes("· feat:") && f.includes("· fix:"));
  t.mockInput.pressKey("/");
  await waitFor((f) => f.includes("Search commits"));
  await t.mockInput.typeText("fix:");
  t.mockInput.pressEnter();
  await waitFor((f) => f.includes("· fix:") && !f.includes("· feat:"));

  t.mockInput.pressKey("ESCAPE");
  await waitFor((f) => f.includes("· feat:"));

  t.renderer.destroy();
});

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { runGitOrThrow, setGitCwd } from "../git/index.js";
import { App } from "./app.js";

let repo: string;

beforeAll(async () => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "gitpretty-tree-")));
  setGitCwd(repo);
  const git = (...a: string[]) => runGitOrThrow(a, { cwd: repo });
  await git("init", "-q");
  await git("config", "user.email", "t@e.com");
  await git("config", "user.name", "T");
  mkdirSync(join(repo, "src/ui"), { recursive: true });
  writeFileSync(join(repo, "src/ui/A.tsx"), "a\n");
  writeFileSync(join(repo, "src/ui/B.tsx"), "b\n");
  writeFileSync(join(repo, "root.md"), "r\n");
  await git("add", "-A");
  await git("commit", "-qm", "init");
  writeFileSync(join(repo, "src/ui/A.tsx"), "a2\n");
  writeFileSync(join(repo, "src/ui/B.tsx"), "b2\n");
  writeFileSync(join(repo, "root.md"), "r2\n");
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

test("directory rows collapse and expand from the keyboard", async () => {
  const t = await testRender(<App />, { width: 70, height: 24 });

  // Tree has loaded: the compacted "src/ui" dir and its files are visible.
  await t.waitForFrame((f) => f.includes("A.tsx") && f.includes("src/ui"));
  expect(t.captureCharFrame()).toContain("B.tsx");

  // First row is the "src/ui" directory; collapse it with the left arrow
  // ("h" does the same thing — this just exercises the arrow-key path too).
  t.mockInput.pressArrow("left");
  await t.waitForFrame((f) => !f.includes("A.tsx"));
  const collapsed = t.captureCharFrame();
  expect(collapsed).not.toContain("A.tsx");
  expect(collapsed).not.toContain("B.tsx");
  expect(collapsed).toContain("src/ui");
  expect(collapsed).toContain("root.md"); // sibling still shown

  // Expand again with the right arrow.
  t.mockInput.pressArrow("right");
  await t.waitForFrame((f) => f.includes("A.tsx"));
  expect(t.captureCharFrame()).toContain("B.tsx");

  t.renderer.destroy();
});

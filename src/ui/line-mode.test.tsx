import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { runGitOrThrow, setGitCwd } from "../git/index.js";
import { App } from "./app.js";

let repo: string;
const git = (...a: string[]) => runGitOrThrow(a, { cwd: repo });

beforeAll(async () => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "porcelain-linemode-")));
  setGitCwd(repo);
  await git("init", "-q");
  await git("config", "user.email", "t@e.com");
  await git("config", "user.name", "T");
  writeFileSync(join(repo, "a.txt"), "one\ntwo\nthree\n");
  await git("add", "-A");
  await git("commit", "-qm", "init");
  // One hunk, two separate changes: two→TWO and three→THREE.
  writeFileSync(join(repo, "a.txt"), "one\nTWO\nTHREE\n");
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

test("`V` line mode stages just the picked lines", async () => {
  const t = await testRender(<App />, { width: 100, height: 30 });
  await t.waitForFrame((f) => f.includes("THREE"));

  t.mockInput.pressKey("V", { shift: true });
  await t.waitForFrame((f) => f.includes("0 selected"));

  // Cursor starts on "-two"; pick it and the "+TWO" two rows down
  // (space advances the cursor), skipping "-three".
  t.mockInput.pressKey(" ");
  t.mockInput.pressKey("j");
  t.mockInput.pressKey(" ");
  await t.waitForFrame((f) => f.includes("2 selected"));
  t.mockInput.pressEnter();

  // Only the two→TWO change reaches the index; three→THREE stays unstaged.
  const deadline = Date.now() + 3000;
  let index = "";
  while (Date.now() < deadline) {
    index = await git("show", ":a.txt");
    if (index !== "one\ntwo\nthree\n") break;
    await Bun.sleep(25);
  }
  expect(index).toBe("one\nTWO\nthree\n");

  t.renderer.destroy();
});

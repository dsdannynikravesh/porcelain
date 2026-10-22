import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { runGitOrThrow, setGitCwd } from "../git/index.js";
import { App } from "./app.js";

let repo: string;
const LONG = "wrapme ".repeat(30).trim();

beforeAll(async () => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), "porcelain-wrap-")));
  setGitCwd(repo);
  const git = (...a: string[]) => runGitOrThrow(a, { cwd: repo });
  await git("init", "-q");
  await git("config", "user.email", "t@e.com");
  await git("config", "user.name", "T");
  writeFileSync(join(repo, "a.txt"), "short\n");
  await git("add", "-A");
  await git("commit", "-qm", "init");
  writeFileSync(join(repo, "a.txt"), `${LONG}\n`);
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

test("`w` toggles long diff lines between wrapped and clipped", async () => {
  const t = await testRender(<App />, { width: 80, height: 24 });
  await t.waitForFrame((f) => f.includes("wrapme"));

  const countOccurrences = (s: string, sub: string) => s.split(sub).length - 1;

  // Wrapping is on by default: the long line flows onto extra rows, so every
  // "wrapme" in it is visible.
  await t.waitForFrame((f) => countOccurrences(f, "wrapme") >= 30);
  const wrapped = countOccurrences(t.captureCharFrame(), "wrapme");

  // `w` turns it off -> the line is clipped to the pane width, leaving only
  // the handful of "wrapme"s that fit on its single row.
  t.mockInput.pressKey("w");
  await t.waitForFrame((f) => countOccurrences(f, "wrapme") < wrapped);
  const clipped = countOccurrences(t.captureCharFrame(), "wrapme");

  expect(clipped).toBeLessThan(wrapped);

  // Toggle back on.
  t.mockInput.pressKey("w");
  await t.waitForFrame((f) => countOccurrences(f, "wrapme") >= wrapped);

  t.renderer.destroy();
});

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

test("`w` wraps long diff lines instead of clipping them", async () => {
  const t = await testRender(<App />, { width: 80, height: 24 });
  await t.waitForFrame((f) => f.includes("wrapme"));

  const countOccurrences = (s: string, sub: string) => s.split(sub).length - 1;

  // Unwrapped: the long line is clipped to the pane width -> "wrapme" appears
  // only a handful of times on its single row.
  const clipped = countOccurrences(t.captureCharFrame(), "wrapme");

  t.mockInput.pressKey("w");
  await t.waitForFrame((f) => countOccurrences(f, "wrapme") > clipped);
  const wrapped = countOccurrences(t.captureCharFrame(), "wrapme");

  expect(wrapped).toBeGreaterThan(clipped);

  // Toggle back off.
  t.mockInput.pressKey("w");
  await t.waitForFrame((f) => countOccurrences(f, "wrapme") <= clipped);

  t.renderer.destroy();
});

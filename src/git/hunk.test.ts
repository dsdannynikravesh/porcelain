import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGitOrThrow, setGitCwd } from "./exec.js";
import { buildLinePatch, type Hunk, parseHunks, stageLines, unstageLines } from "./hunk.js";

const PREAMBLE = "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt";

function hunkOf(header: string, lines: string[]): { patch: string; hunk: Hunk } {
  const patch = [PREAMBLE, header, ...lines, ""].join("\n");
  return { patch, hunk: parseHunks(patch)[0]! };
}

/** Just the hunk part (header + body) of a built patch. */
function bodyOf(patch: string | null): string[] {
  if (patch === null) return [];
  const lines = patch.split("\n");
  return lines.slice(lines.findIndex((l) => l.startsWith("@@"))).filter((l) => l !== "");
}

describe("buildLinePatch", () => {
  // a / -b / -c / +B / +C / d
  const { patch, hunk } = hunkOf("@@ -1,4 +1,4 @@ ctx", [" a", "-b", "-c", "+B", "+C", " d"]);

  test("staging one +/- pair keeps the rest as index content", () => {
    expect(bodyOf(buildLinePatch(patch, hunk, new Set([1, 3]), false))).toEqual([
      "@@ -1,4 +1,4 @@ ctx",
      " a",
      "-b",
      "+B", // paired with "-b", so it lands where b was…
      " c", // …ahead of the unselected removal, still in the index
      " d", // unselected "+C" dropped
    ]);
  });

  test("staging the second pair keeps the first line in place", () => {
    expect(bodyOf(buildLinePatch(patch, hunk, new Set([2, 4]), false))).toEqual([
      "@@ -1,4 +1,4 @@ ctx",
      " a",
      " b",
      "-c",
      "+C",
      " d",
    ]);
  });

  test("staging only an addition", () => {
    expect(bodyOf(buildLinePatch(patch, hunk, new Set([4]), false))).toEqual([
      "@@ -1,4 +1,5 @@ ctx",
      " a",
      " b",
      " c",
      "+C",
      " d",
    ]);
  });

  test("unstaging swaps the roles of + and -", () => {
    expect(bodyOf(buildLinePatch(patch, hunk, new Set([2]), true))).toEqual([
      "@@ -1,5 +1,4 @@ ctx",
      " a",
      " B", // unselected addition: it's what the index holds ("-b" dropped)
      "-c",
      " C",
      " d",
    ]);
  });

  test("returns null when no change line is selected", () => {
    expect(buildLinePatch(patch, hunk, new Set(), false)).toBeNull();
    expect(buildLinePatch(patch, hunk, new Set([0, 5]), false)).toBeNull();
  });

  test("a side that becomes empty is addressed by the line before it", () => {
    const h = hunkOf("@@ -5,2 +5,2 @@", ["-x", "-y", "+X", "+Y"]);
    expect(bodyOf(buildLinePatch(h.patch, h.hunk, new Set([0, 1]), false))).toEqual([
      "@@ -5,2 +4,0 @@",
      "-x",
      "-y",
    ]);
  });

  test("a no-newline marker follows its line, and is dropped with it", () => {
    const h = hunkOf("@@ -1,1 +1,1 @@", ["-old", "\\ No newline at end of file", "+new"]);
    // Keep the removal only: its marker stays, the dropped "+new" had none.
    expect(bodyOf(buildLinePatch(h.patch, h.hunk, new Set([0]), false))).toEqual([
      "@@ -1,1 +0,0 @@",
      "-old",
      "\\ No newline at end of file",
    ]);
    const h2 = hunkOf("@@ -1,1 +1,1 @@", ["-old", "+new", "\\ No newline at end of file"]);
    // Unselected "+new" is dropped, so its marker goes too.
    expect(bodyOf(buildLinePatch(h2.patch, h2.hunk, new Set([0]), false))).toEqual([
      "@@ -1,1 +0,0 @@",
      "-old",
    ]);
  });
});

describe("stageLines / unstageLines against a real repo", () => {
  let repo: string;
  const git = (...a: string[]) => runGitOrThrow(a, { cwd: repo });

  beforeAll(async () => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), "porcelain-lines-")));
    setGitCwd(repo);
    await git("init", "-q");
    await git("config", "user.email", "t@e.com");
    await git("config", "user.name", "T");
    writeFileSync(join(repo, "f.txt"), "1\n2\n3\n4\n5\n");
    await git("add", "-A");
    await git("commit", "-qm", "init");
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  test("stages 2 of 4 changed lines, then unstages one back", async () => {
    writeFileSync(join(repo, "f.txt"), "1\nTWO\n3\nFOUR\n5\n");
    const unstaged = await git("diff", "--", "f.txt");
    const hunk = parseHunks(unstaged)[0]!;
    // Pick "-2" and "+TWO" only, leaving the 4→FOUR change unstaged.
    const pick = new Set(hunk.lines.flatMap((l, i) => (l === "-2" || l === "+TWO" ? [i] : [])));
    expect((await stageLines(unstaged, hunk, pick)).ok).toBe(true);
    expect(await git("show", ":f.txt")).toBe("1\nTWO\n3\n4\n5\n");

    const staged = await git("diff", "--cached", "--", "f.txt");
    const stagedHunk = parseHunks(staged)[0]!;
    // Unstage just the "+TWO" side: the index loses TWO but "2" stays gone.
    const back = new Set(stagedHunk.lines.flatMap((l, i) => (l === "+TWO" ? [i] : [])));
    expect((await unstageLines(staged, stagedHunk, back)).ok).toBe(true);
    expect(await git("show", ":f.txt")).toBe("1\n3\n4\n5\n");
  });

  // Property check: for random edits and a random subset of lines, every
  // built patch must apply, and finishing the job with whole hunks must land
  // exactly on the worktree (staging) or back on HEAD (unstaging).
  test("random partial stage/unstage always applies and composes", async () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const base = Array.from({ length: 12 }, (_, i) => `line ${i}`);
    const changeLinesOf = (patch: string) =>
      parseHunks(patch)
        .flatMap((x) => x.lines)
        .filter((l) => /^[+-]/.test(l))
        .sort();
    const pickSome = (h: Hunk) =>
      new Set(h.lines.flatMap((l, i) => (/^[+-]/.test(l) && rand(2) === 0 ? [i] : [])));

    for (let round = 0; round < 25; round++) {
      writeFileSync(join(repo, "p.txt"), `${base.join("\n")}\n`);
      await git("add", "p.txt");
      await git("commit", "-qm", `base ${round}`, "--allow-empty");
      const edited = base.flatMap((l) => {
        const r = rand(6);
        if (r === 0) return []; // delete
        if (r === 1) return [`${l} changed`]; // modify
        if (r === 2) return [l, `new after ${l}`]; // insert
        return [l];
      });
      const worktree = `${edited.join("\n")}\n`;
      writeFileSync(join(repo, "p.txt"), worktree);

      // Stage a random subset of the first hunk, then everything that's left.
      const unstaged = await git("diff", "--", "p.txt");
      if (!unstaged) continue;
      const h = parseHunks(unstaged)[0]!;
      const some = pickSome(h);
      if (some.size > 0) {
        expect((await stageLines(unstaged, h, some)).ok).toBe(true);
        // What reached the index is exactly the picked lines — none lost,
        // none extra (an unpicked removal must not sneak in, and so on).
        const picked = [...some].map((i) => h.lines[i]!).sort();
        expect(changeLinesOf(await git("diff", "--cached", "--", "p.txt"))).toEqual(picked);
      }
      await git("add", "p.txt");
      expect(await git("show", ":p.txt")).toBe(worktree);

      // Now unstage a random subset back out, then the rest.
      const staged = await git("diff", "--cached", "--", "p.txt");
      const sh = parseHunks(staged)[0]!;
      const back = pickSome(sh);
      if (back.size > 0) expect((await unstageLines(staged, sh, back)).ok).toBe(true);
      await git("reset", "-q", "--", "p.txt");
      expect(await git("show", ":p.txt")).toBe(`${base.join("\n")}\n`);
    }
  });
});

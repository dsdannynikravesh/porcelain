import { expect, test } from "bun:test";
import { buildTreeRows, ancestorDirs } from "./tree.js";
import type { SelectableEntry } from "./model.js";

function entry(
  path: string,
  section: "unstaged" | "staged" = "unstaged",
): SelectableEntry {
  return {
    section,
    key: `${section}:${path}`,
    entry: {
      path,
      x: ".",
      y: "M",
      staged: section === "staged",
      unstaged: section === "unstaged",
      kind: "modified",
      untracked: false,
      unmerged: false,
    },
  };
}

test("nests files under directory rows, dirs before files", () => {
  const rows = buildTreeRows(
    [entry("src/ui/app.tsx"), entry("src/model.ts"), entry("README.md")],
    new Set(),
  );
  expect(
    rows.map(
      (r) => `${r.type}:${r.type === "dir" ? r.path : r.name}@${r.depth}`,
    ),
  ).toEqual([
    "dir:src@0",
    "dir:src/ui@1",
    "file:app.tsx@2",
    "file:model.ts@1",
    "file:README.md@0",
  ]);
});

test("compacts single-child directory chains", () => {
  const rows = buildTreeRows([entry("a/b/c/deep.ts")], new Set());
  expect(rows[0]).toMatchObject({
    type: "dir",
    path: "a/b/c",
    name: "a/b/c",
    depth: 0,
  });
  expect(rows[1]).toMatchObject({ type: "file", name: "deep.ts", depth: 1 });
});

test("collapsed directory hides its descendants but still counts them", () => {
  const rows = buildTreeRows(
    [entry("src/a.ts"), entry("src/nested/b.ts"), entry("top.ts")],
    new Set(["src"]),
  );
  expect(rows.map((r) => r.key)).toEqual(["dir:src", "unstaged:top.ts"]);
  expect(rows[0]).toMatchObject({ type: "dir", collapsed: true, fileCount: 2 });
});

test("staged and unstaged versions of one path produce two file rows", () => {
  const rows = buildTreeRows(
    [entry("x.ts", "unstaged"), entry("x.ts", "staged")],
    new Set(),
  );
  expect(rows.filter((r) => r.type === "file")).toHaveLength(2);
});

test("ancestorDirs lists every parent directory", () => {
  expect(ancestorDirs("src/ui/components/Foo.tsx")).toEqual([
    "src",
    "src/ui",
    "src/ui/components",
  ]);
  expect(ancestorDirs("top.ts")).toEqual([]);
});

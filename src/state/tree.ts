import type { SelectableEntry } from "./model.js";

export interface DirRow {
  type: "dir";
  /** Stable selection key, e.g. "dir:src/ui". */
  key: string;
  /** Full path from repo root, e.g. "src/ui". */
  path: string;
  /** Display label (may span several segments when chains are compacted). */
  name: string;
  depth: number;
  collapsed: boolean;
  /** Number of changed files anywhere beneath this directory. */
  fileCount: number;
}

export interface FileRow {
  type: "file";
  /** The SelectableEntry key (e.g. "unstaged:src/ui/App.tsx"). */
  key: string;
  name: string;
  depth: number;
  entry: SelectableEntry;
}

export type TreeRow = DirRow | FileRow;

interface Node {
  dirs: Map<string, Node>;
  files: SelectableEntry[];
}

const newNode = (): Node => ({ dirs: new Map(), files: [] });

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

/** Every directory path on the way to `filePath` (["src", "src/ui"]). */
export function ancestorDirs(filePath: string): string[] {
  const segs = filePath.split("/");
  const out: string[] = [];
  for (let i = 1; i < segs.length; i++) out.push(segs.slice(0, i).join("/"));
  return out;
}

function insert(root: Node, entry: SelectableEntry): void {
  // Drop empty segments so a stray "dir/" path doesn't create a blank file row.
  const segs = entry.entry.path.split("/").filter((s) => s.length > 0);
  if (segs.length === 0) return;
  let node = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    let child = node.dirs.get(seg);
    if (!child) {
      child = newNode();
      node.dirs.set(seg, child);
    }
    node = child;
  }
  node.files.push(entry);
}

function countFiles(node: Node): number {
  let n = node.files.length;
  for (const d of node.dirs.values()) n += countFiles(d);
  return n;
}

/**
 * Turn a flat list of changed files into the visible rows of a collapsible
 * folder tree: directories first (alphabetical), then files, indented by depth.
 * Single-child directory chains are compacted VS Code–style ("src/ui/foo").
 */
export function buildTreeRows(
  entries: SelectableEntry[],
  collapsed: ReadonlySet<string>,
): TreeRow[] {
  const root = newNode();
  for (const e of entries) insert(root, e);

  const rows: TreeRow[] = [];

  const emitChildren = (node: Node, prefix: string, depth: number): void => {
    for (const name of [...node.dirs.keys()].sort((a, b) => a.localeCompare(b))) {
      emitDir(name, node.dirs.get(name)!, prefix, depth);
    }
    const files = [...node.files].sort((a, b) =>
      basename(a.entry.path).localeCompare(basename(b.entry.path)),
    );
    for (const f of files) {
      rows.push({ type: "file", key: f.key, name: basename(f.entry.path), depth, entry: f });
    }
  };

  const emitDir = (name: string, node: Node, prefix: string, depth: number): void => {
    let label = name;
    let path = prefix ? `${prefix}/${name}` : name;
    let cur = node;
    // Compact a/ -> b/ -> c/ into one "a/b/c" row while each link is the only child.
    while (cur.files.length === 0 && cur.dirs.size === 1) {
      const [childName, childNode] = [...cur.dirs.entries()][0]!;
      label = `${label}/${childName}`;
      path = `${path}/${childName}`;
      cur = childNode;
    }

    const isCollapsed = collapsed.has(path);
    rows.push({
      type: "dir",
      key: `dir:${path}`,
      path,
      name: label,
      depth,
      collapsed: isCollapsed,
      fileCount: countFiles(cur),
    });
    if (!isCollapsed) emitChildren(cur, path, depth + 1);
  };

  emitChildren(root, "", 0);
  return rows;
}

import { extname } from "node:path";
import { runGit } from "./exec.js";
import type { FileEntry } from "./status.js";

/** Map a file extension to a tree-sitter/highlight filetype hint for the diff view. */
export function filetypeFor(path: string): string | undefined {
  const ext = extname(path).toLowerCase().replace(/^\./, "");
  if (!ext) return undefined;
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    md: "markdown",
    markdown: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    py: "python",
    rs: "rust",
    go: "go",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    java: "java",
    rb: "ruby",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    sql: "sql",
    lua: "lua",
    vim: "vim",
  };
  return map[ext] ?? ext;
}

export interface FileDiff {
  /** Unified diff text, or "" when there is nothing to render. */
  patch: string;
  filetype?: string;
  /** True when the diff was omitted because it exceeds the size guard. */
  truncated: boolean;
  binary: boolean;
  /** Why there's no patch to show, when `patch` is "" but the file did change. */
  emptyReason?: "new-empty-file" | "mode-only" | "no-content-change";
}

const MAX_DIFF_BYTES = 400_000;

/**
 * Turn raw `git diff`/`git show` stdout into a `FileDiff`, applying the same
 * binary/size/empty-change guards regardless of what produced the patch.
 */
export function patchToFileDiff(patch: string, filetype?: string): FileDiff {
  const binary = /^Binary files .* differ$/m.test(patch);
  if (binary) return { patch: "", filetype, truncated: false, binary: true };

  if (Buffer.byteLength(patch) > MAX_DIFF_BYTES) {
    return { patch: "", filetype, truncated: true, binary: false };
  }

  // A patch with no `@@` hunk has nothing to render — git still emits a header
  // for new empty files, mode changes, etc. Blank the patch so the diff view
  // doesn't fall back to showing a stale one, and say why.
  if (patch.trim() !== "" && !/^@@/m.test(patch)) {
    let emptyReason: FileDiff["emptyReason"] = "no-content-change";
    if (/^new file mode/m.test(patch)) emptyReason = "new-empty-file";
    else if (/^(old|new) mode /m.test(patch)) emptyReason = "mode-only";
    return {
      patch: "",
      filetype,
      truncated: false,
      binary: false,
      emptyReason,
    };
  }

  return { patch, filetype, truncated: false, binary: false };
}

/**
 * Produce a unified diff for one file. `staged` selects index-vs-HEAD;
 * otherwise worktree-vs-index (or worktree-vs-nothing for untracked files).
 */
export async function diffFile(entry: FileEntry, staged: boolean): Promise<FileDiff> {
  const filetype = filetypeFor(entry.path);

  let patch = "";
  if (entry.untracked) {
    // Untracked: synthesize an all-added diff against an empty tree.
    const res = await runGit(["diff", "--no-index", "--", "/dev/null", entry.path]);
    patch = res.stdout;
  } else {
    const args = ["diff", "--no-color"];
    if (staged) args.push("--staged");
    args.push("--", entry.path);
    if (entry.origPath) args.push(entry.origPath);
    const res = await runGit(args);
    patch = res.stdout;
  }

  return patchToFileDiff(patch, filetype);
}

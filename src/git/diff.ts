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

/** The full staged diff (index vs HEAD) across every staged file, in one
 *  call — raw text, not turned into a `FileDiff`, since the only consumer
 *  (the Copilot commit-message prompt) wants the whole multi-file patch. */
export async function diffStaged(): Promise<string> {
  const res = await runGit(["diff", "--staged", "--no-color"]);
  return res.stdout;
}

/**
 * Split a multi-file unified diff (as `git diff` emits for a directory
 * pathspec — every file's patch back to back) into one raw patch per file,
 * keyed by that file's current path (the "b/" side of its "diff --git"
 * line, which is the same for a plain edit, the new name for a rename, and
 * still the deleted path for a deletion — never /dev/null itself, that only
 * ever shows up in the "+++ " line below it).
 */
function splitMultiFileDiff(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  let path: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (path && lines.length > 0) out.set(path, lines.join("\n"));
    lines = [];
  };
  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      // Doesn't handle the rare quoted-path form git uses for names with
      // spaces/unicode (falls back to no match, so that file's block is
      // silently dropped from the folder view rather than misattributed).
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      path = m ? m[2]! : null;
    }
    lines.push(line);
  }
  flush();
  return out;
}

/**
 * Unified diffs for every *tracked* file under `dirPath`, in one `git diff`
 * call instead of one per file — the same worktree-vs-index/index-vs-HEAD
 * split as `diffFile`, just scoped to a directory and batched. Untracked
 * files aren't included (git has no bulk equivalent of the `--no-index`
 * synthesis `diffFile` does per file); callers fetch those separately.
 */
export async function diffDirTracked(
  dirPath: string,
  staged: boolean,
): Promise<Map<string, FileDiff>> {
  const args = ["diff", "--no-color"];
  if (staged) args.push("--staged");
  args.push("--", dirPath);
  const res = await runGit(args);
  const out = new Map<string, FileDiff>();
  for (const [path, patch] of splitMultiFileDiff(res.stdout)) {
    out.set(path, patchToFileDiff(patch, filetypeFor(path)));
  }
  return out;
}

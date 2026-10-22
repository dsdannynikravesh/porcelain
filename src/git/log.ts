import { type FileDiff, filetypeFor, patchToFileDiff } from "./diff.js";
import { runGit, runGitOrThrow } from "./exec.js";
import { type ChangeKind, kindFromCode } from "./status.js";

export interface CommitEntry {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  subject: string;
}

// Unit/record separator bytes — practically guaranteed not to show up in a
// commit subject, unlike "|" or ",". Same idea as status.ts's use of "\0".
const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

export interface ListCommitsOptions {
  /** Only commits on `branch` that HEAD doesn't have yet — ignoring any whose
   *  patch HEAD already contains (already cherry-picked), via --cherry-pick. */
  notInHead?: string;
  /** Only commits whose message contains this text (case-insensitive, literal). */
  grep?: string;
}

const PRETTY = `--pretty=format:%H${FIELD_SEP}%h${FIELD_SEP}%an${FIELD_SEP}%ad${FIELD_SEP}%s${RECORD_SEP}`;

/** Read one page of commits. `skip` is the history cursor for the next page. */
export async function listCommits(
  limit = 100,
  skip = 0,
  opts: ListCommitsOptions = {},
): Promise<CommitEntry[]> {
  const args = ["log", `--skip=${skip}`, `--max-count=${limit}`, "--date=short", PRETTY];
  if (opts.grep) args.push("--regexp-ignore-case", "--fixed-strings", `--grep=${opts.grep}`);
  if (opts.notInHead) args.push("--cherry-pick", "--right-only", `HEAD...${opts.notInHead}`, "--");
  return parseCommits(await runGitOrThrow(args));
}

/**
 * The commit `ref` names (a sha prefix, branch, tag, …), or null if it
 * doesn't resolve to one — lets a history search for "a1b2c3" find that
 * commit even though its message doesn't contain the text.
 */
export async function resolveCommit(ref: string): Promise<CommitEntry | null> {
  const verify = await runGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (verify.code !== 0) return null;
  const raw = await runGitOrThrow(["log", "-1", "--date=short", PRETTY, verify.stdout.trim()]);
  return parseCommits(raw)[0] ?? null;
}

function parseCommits(raw: string): CommitEntry[] {
  const commits: CommitEntry[] = [];
  for (const record of raw.split(RECORD_SEP)) {
    // git joins entries with "\n", so every record but the first arrives with
    // a leading newline — strip it before splitting on the field separator.
    const clean = record.replace(/^\n/, "");
    if (!clean) continue;
    const [sha, shortSha, author, date, subject] = clean.split(FIELD_SEP);
    if (!sha) continue;
    commits.push({
      sha,
      shortSha: shortSha ?? sha.slice(0, 7),
      author: author ?? "",
      date: date ?? "",
      subject: subject ?? "",
    });
  }
  return commits;
}

export interface CommitFileEntry {
  /** Path relative to repo root (the new path for renames). */
  path: string;
  /** Original path for renames/copies. */
  origPath?: string;
  kind: ChangeKind;
}

/** Files changed by one commit, relative to its first parent (or the empty tree for a root commit). */
export async function filesInCommit(sha: string): Promise<CommitFileEntry[]> {
  const raw = await runGitOrThrow([
    "diff-tree",
    "--no-commit-id",
    "--name-status",
    "-r",
    "-M",
    "--root",
    "-z",
    sha,
  ]);

  const tokens = raw.split("\0").filter((t) => t !== "");
  const files: CommitFileEntry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i] ?? "";
    const letter = code[0] ?? "";
    if (letter === "R" || letter === "C") {
      const origPath = tokens[++i] ?? "";
      const path = tokens[++i] ?? "";
      files.push({ path, origPath, kind: kindFromCode(letter) });
    } else {
      const path = tokens[++i] ?? "";
      files.push({ path, kind: kindFromCode(letter) });
    }
  }
  return files;
}

/** Diff for a single file as it changed in one commit (vs. that commit's parent). */
export async function commitFileDiff(
  sha: string,
  path: string,
  origPath?: string,
): Promise<FileDiff> {
  const filetype = filetypeFor(path);
  // --format="" suppresses the commit-message header `git show` would
  // otherwise print before the diff.
  const args = ["show", "--no-color", "--format=", sha, "--", path];
  if (origPath) args.push(origPath);
  const res = await runGit(args);
  return patchToFileDiff(res.stdout, filetype);
}

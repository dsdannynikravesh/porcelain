import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browse as gHBrowse } from "../gh/index.js";
import {
  type Branch,
  type CommitOutcome,
  type Contributor,
  diffFile,
  discardFile,
  type FetchOutcome,
  type FileDiff,
  type FileEntry,
  getRepoState,
  abortMerge as gitAbortMerge,
  abortRebase as gitAbortRebase,
  commit as gitCommit,
  continueMerge as gitContinueMerge,
  continueRebase as gitContinueRebase,
  createBranch as gitCreateBranch,
  deleteBranch as gitDeleteBranch,
  fetch as gitFetch,
  mergeBranch as gitMergeBranch,
  pull as gitPull,
  push as gitPush,
  resetSoftTo as gitResetSoftTo,
  squashToHead as gitSquash,
  stageAll as gitStageAll,
  stageHunk as gitStageHunk,
  stashApply as gitStashApply,
  stashDrop as gitStashDrop,
  stashPop as gitStashPop,
  stashPush as gitStashPush,
  switchBranch as gitSwitchBranch,
  unstageAll as gitUnstageAll,
  unstageHunk as gitUnstageHunk,
  type Hunk,
  listBranches,
  listContributors,
  listReflog,
  listStashes,
  type PullOutcome,
  type PushOptions,
  type PushOutcome,
  parseHunks,
  type ReflogEntry,
  type RepoState,
  type RepoStateOutcome,
  type RepoStatus,
  type SquashOutcome,
  type StashEntry,
  type StashOutcome,
  type SwitchOutcome,
  stageFile,
  status,
  type UndoOutcome,
  unstageFile,
} from "../git/index.js";
import { ancestorDirs, buildTreeRows, type TreeRow } from "./tree.js";

export type Section = "unstaged" | "staged";

export interface SelectableEntry {
  section: Section;
  entry: FileEntry;
  key: string;
}

export interface Toast {
  kind: "ok" | "err" | "info";
  text: string;
}

export interface RepoModel {
  status: RepoStatus | null;
  /** "clean" unless mid-merge or mid-rebase (detected from .git's own marker files). */
  repoState: RepoState;
  /** Runs `git rebase --continue` or `git commit --no-edit` (finishing a merge), whichever `repoState` calls for. */
  continueConflict: () => Promise<RepoStateOutcome>;
  /** Runs `git rebase --abort` or `git merge --abort`, whichever `repoState` calls for. */
  abortConflict: () => Promise<RepoStateOutcome>;
  entries: SelectableEntry[];
  /** Visible rows of the folder tree (directories + files), in display order. */
  rows: TreeRow[];
  selectedKey: string | null;
  /** The selected file, or null when a directory row (or nothing) is selected. */
  selected: SelectableEntry | null;
  diff: FileDiff | null;
  diffLoading: boolean;
  /** Hunks of the currently-shown diff — [] when there's nothing hunk-stageable
   *  (no file selected, a conflicted/unmerged file, or a diff with no `@@` hunks). */
  hunks: Hunk[];
  /** Which of `hunks` is selected, clamped to the current hunk count. */
  selectedHunkIndex: number;
  moveHunk: (delta: number) => void;
  /** Stages (if viewing the unstaged diff) or unstages (if viewing the staged
   *  diff) just the selected hunk, leaving the file's other hunks alone. */
  toggleHunkStage: () => Promise<void>;
  loading: boolean;
  error: string | null;
  toast: Toast | null;
  /** null when idle; otherwise a label for whatever git mutation is in flight ("Pushing", "Committing", ...). */
  busy: string | null;
  refresh: () => Promise<void>;
  select: (key: string) => void;
  move: (delta: number) => void;
  /** Collapse / expand the selected directory (dir key), or a given one. */
  toggleCollapsed: (key?: string) => void;
  setCollapsed: (key: string, collapsed: boolean) => void;
  toggleStage: () => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  discardSelected: () => Promise<void>;
  commit: (message: string, amend: boolean) => Promise<CommitOutcome>;
  /** Combine every commit from HEAD back through `baseSha` (inclusive) into one. */
  squash: (baseSha: string, message: string) => Promise<SquashOutcome>;
  push: (opts?: PushOptions) => Promise<PushOutcome>;
  pull: () => Promise<PullOutcome>;
  fetch: () => Promise<FetchOutcome>;
  branches: Branch[];
  /** Refetches the branch list — call when opening the branch picker. */
  loadBranches: () => Promise<void>;
  switchBranch: (name: string) => Promise<SwitchOutcome>;
  createBranch: (name: string) => Promise<SwitchOutcome>;
  deleteBranch: (name: string) => Promise<SwitchOutcome>;
  /** Merges `name` into whatever branch is currently checked out. */
  mergeBranch: (name: string) => Promise<SwitchOutcome>;
  stashes: StashEntry[];
  /** Refetches the stash list — call when opening the stash picker. */
  loadStashes: () => Promise<void>;
  /** Stashes everything (staged, unstaged, untracked), leaving a clean tree. */
  stashPush: (message?: string) => Promise<StashOutcome>;
  stashPop: (ref: string) => Promise<StashOutcome>;
  stashApply: (ref: string) => Promise<StashOutcome>;
  stashDrop: (ref: string) => Promise<StashOutcome>;
  contributors: Contributor[];
  /** Refetches this repo's contributor list — call when opening the co-author picker. */
  loadContributors: () => Promise<void>;
  reflog: ReflogEntry[];
  /** Refetches the reflog — call when opening the undo picker. */
  loadReflog: () => Promise<void>;
  /** Soft-resets HEAD to `sha` — undoes everything since, kept as staged changes. */
  undoTo: (sha: string) => Promise<UndoOutcome>;
  setToast: (t: Toast | null) => void;
  /** Opens this repo on github.com via `gh browse` (a no-op toast if `gh` isn't installed/authed). */
  browse: () => Promise<void>;
}

function buildEntries(s: RepoStatus): SelectableEntry[] {
  const list: SelectableEntry[] = [];
  for (const entry of s.unstaged) {
    list.push({ section: "unstaged", entry, key: `unstaged:${entry.path}` });
  }
  for (const entry of s.staged) {
    list.push({ section: "staged", entry, key: `staged:${entry.path}` });
  }
  return list;
}

const dirPathOf = (key: string) => (key.startsWith("dir:") ? key.slice(4) : null);

export function useRepoModel(): RepoModel {
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [repoState, setRepoState] = useState<RepoState>("clean");
  const [entries, setEntries] = useState<SelectableEntry[]>([]);
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [selectedHunkIndex, setSelectedHunkIndexState] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [reflog, setReflog] = useState<ReflogEntry[]>([]);

  const rows = useMemo(() => buildTreeRows(entries, collapsedDirs), [entries, collapsedDirs]);

  const selectedKeyRef = useRef<string | null>(null);
  selectedKeyRef.current = selectedKey;
  const rowsRef = useRef<TreeRow[]>([]);
  rowsRef.current = rows;
  const collapsedRef = useRef<ReadonlySet<string>>(collapsedDirs);
  collapsedRef.current = collapsedDirs;
  const entriesRef = useRef<SelectableEntry[]>([]);
  entriesRef.current = entries;
  const diffRef = useRef<FileDiff | null>(null);
  diffRef.current = diff;

  const diffReqRef = useRef(0);
  /** Rows as of the previous refresh, for index-based fallback selection. */
  const prevRowsRef = useRef<TreeRow[]>([]);
  /** Selection to apply on the next refresh, set by mutations. */
  const pendingSelectRef = useRef<string | null>(null);
  /** Label of whatever git mutation + refresh is in flight, or null when idle. */
  const busyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, rs] = await Promise.all([status(), getRepoState()]);
      setRepoStatus(s);
      setRepoState(rs);
      setError(null);
      const nextEntries = buildEntries(s);
      entriesRef.current = nextEntries;
      setEntries(nextEntries);

      const nextRows = buildTreeRows(nextEntries, collapsedRef.current);

      // An explicit post-mutation target (e.g. "follow the file I just staged").
      const pending = pendingSelectRef.current;
      pendingSelectRef.current = null;

      const prevKey = selectedKeyRef.current;
      const has = (k: string | null) => !!k && nextRows.some((r) => r.key === k);

      let nextKey: string | null;
      if (has(pending)) {
        nextKey = pending;
      } else if (has(prevKey)) {
        nextKey = prevKey;
      } else if (prevKey) {
        // The selected row vanished — land on whatever now sits near that spot.
        const prevIdx = prevRowsRef.current.findIndex((r) => r.key === prevKey);
        const clamped = Math.min(Math.max(prevIdx, 0), nextRows.length - 1);
        nextKey = nextRows[clamped]?.key ?? nextRows[0]?.key ?? null;
      } else {
        nextKey = nextRows[0]?.key ?? null;
      }
      selectedKeyRef.current = nextKey;
      setSelectedKey(nextKey);
      prevRowsRef.current = nextRows;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load the diff for the current selection (files only) whenever it changes.
  useEffect(() => {
    const current = entries.find((e) => e.key === selectedKey) ?? null;
    if (!current) {
      setDiff(null);
      return;
    }
    const reqId = ++diffReqRef.current;
    setDiffLoading(true);
    diffFile(current.entry, current.section === "staged")
      .then((d) => {
        if (diffReqRef.current === reqId) setDiff(d);
      })
      .catch((err) => {
        if (diffReqRef.current === reqId) {
          setDiff(null);
          setToast({
            kind: "err",
            text: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .finally(() => {
        if (diffReqRef.current === reqId) setDiffLoading(false);
      });
  }, [selectedKey, entries]);

  // Hunks of whatever diff is currently shown — never for a conflicted file
  // (its diff isn't a normal two-way patch, so hunk staging doesn't apply;
  // conflicts are resolved via `e` per feature #2, not here).
  const hunks = useMemo(() => {
    const current = entries.find((e) => e.key === selectedKey) ?? null;
    if (!current || current.entry.unmerged) return [];
    if (!diff || diff.binary || diff.truncated || diff.patch.trim() === "") return [];
    return parseHunks(diff.patch);
  }, [entries, selectedKey, diff]);
  const hunksRef = useRef<Hunk[]>([]);
  hunksRef.current = hunks;

  const selectedHunkIndexRef = useRef(0);
  const clampedHunkIndex = Math.min(selectedHunkIndex, Math.max(0, hunks.length - 1));
  selectedHunkIndexRef.current = clampedHunkIndex;

  // Reset to the first hunk whenever the shown diff's content actually
  // changes — a freshly-picked file, or the hunk count shifting after a
  // stage/unstage. Keyed on the patch text itself (not the `diff` object,
  // which is a fresh reference on every refresh even when unchanged) so an
  // unrelated background refresh doesn't yank the cursor mid-navigation.
  useEffect(() => {
    selectedHunkIndexRef.current = 0;
    setSelectedHunkIndexState(0);
  }, [diff?.patch]);

  const moveHunk = useCallback((delta: number) => {
    const list = hunksRef.current;
    if (list.length === 0) return;
    const next = Math.min(Math.max(selectedHunkIndexRef.current + delta, 0), list.length - 1);
    selectedHunkIndexRef.current = next;
    setSelectedHunkIndexState(next);
  }, []);

  // Update the ref synchronously too, so bursts of keypresses that land before
  // the next render (e.g. "jj") each see the updated selection.
  const setSelected = useCallback((key: string | null) => {
    selectedKeyRef.current = key;
    setSelectedKey(key);
  }, []);

  const select = useCallback((key: string) => setSelected(key), [setSelected]);

  const move = useCallback(
    (delta: number) => {
      const list = rowsRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex((r) => r.key === selectedKeyRef.current);
      const nextIdx = Math.min(Math.max((idx < 0 ? 0 : idx) + delta, 0), list.length - 1);
      const nextRow = list[nextIdx];
      if (nextRow) setSelected(nextRow.key);
    },
    [setSelected],
  );

  const setCollapsed = useCallback((key: string, collapsed: boolean) => {
    const path = dirPathOf(key);
    if (!path) return;
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (collapsed) next.add(path);
      else next.delete(path);
      collapsedRef.current = next;
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(
    (key?: string) => {
      const target = key ?? selectedKeyRef.current;
      const path = target ? dirPathOf(target) : null;
      if (!path) return;
      setCollapsed(target!, !collapsedRef.current.has(path));
    },
    [setCollapsed],
  );

  const expandAncestors = useCallback((filePath: string) => {
    setCollapsedDirs((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const dir of ancestorDirs(filePath)) next.delete(dir);
      collapsedRef.current = next;
      return next;
    });
  }, []);

  const runMutation = useCallback(
    async (fn: () => Promise<void>, busyLabel: string, okText?: string) => {
      // Serialise mutations — ignore new ones while one is in flight so a burst
      // of keypresses can't act on stale state.
      if (busyRef.current) return;
      busyRef.current = busyLabel;
      setBusy(busyLabel);
      try {
        await fn();
        if (okText) setToast({ kind: "ok", text: okText });
        await refresh();
      } catch (err) {
        setToast({
          kind: "err",
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh],
  );

  const toggleStage = useCallback(async () => {
    if (busyRef.current) return;
    const current = entriesRef.current.find((e) => e.key === selectedKeyRef.current);
    if (!current) return;
    const path = current.entry.path;
    const goingToStaged = current.section === "unstaged";
    // Follow the file across sections so a second toggle acts on the same file.
    expandAncestors(path);
    pendingSelectRef.current = `${goingToStaged ? "staged" : "unstaged"}:${path}`;
    await runMutation(
      () => (goingToStaged ? stageFile(current.entry) : unstageFile(current.entry)),
      goingToStaged ? "Staging file" : "Unstaging file",
    );
  }, [runMutation, expandAncestors]);

  const toggleHunkStage = useCallback(async () => {
    if (busyRef.current) return;
    const current = entriesRef.current.find((e) => e.key === selectedKeyRef.current);
    const hunk = hunksRef.current[selectedHunkIndexRef.current];
    const patch = diffRef.current?.patch;
    if (!current || current.entry.unmerged || !hunk || !patch) return;
    const stagingIn = current.section === "unstaged";
    // Stay on the same key — if this was the file's only hunk on this side,
    // it'll vanish and refresh()'s nearest-row fallback takes over instead.
    pendingSelectRef.current = selectedKeyRef.current;
    await runMutation(
      async () => {
        const outcome = stagingIn
          ? await gitStageHunk(patch, hunk)
          : await gitUnstageHunk(patch, hunk);
        if (!outcome.ok) throw new Error(outcome.message);
      },
      stagingIn ? "Staging hunk" : "Unstaging hunk",
    );
  }, [runMutation]);

  const stageAll = useCallback(
    () => runMutation(() => gitStageAll(), "Staging all changes", "Staged all changes"),
    [runMutation],
  );
  const unstageAll = useCallback(
    () => runMutation(() => gitUnstageAll(), "Unstaging everything", "Unstaged everything"),
    [runMutation],
  );

  const discardSelected = useCallback(async () => {
    const current = entriesRef.current.find((e) => e.key === selectedKeyRef.current);
    if (!current) return;
    await runMutation(
      () => discardFile(current.entry),
      "Discarding",
      `Discarded ${current.entry.path}`,
    );
  }, [runMutation]);

  const commit = useCallback(
    async (message: string, amend: boolean): Promise<CommitOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      const label = amend ? "Amending commit" : "Committing";
      busyRef.current = label;
      setBusy(label);
      try {
        const outcome = await gitCommit(message, { amend });
        setToast({
          kind: outcome.ok ? "ok" : "err",
          text: outcome.ok ? `Committed ${outcome.message}` : outcome.message,
        });
        await refresh();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh],
  );

  const squash = useCallback(
    async (baseSha: string, message: string): Promise<SquashOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Squashing";
      setBusy("Squashing");
      try {
        const outcome = await gitSquash(baseSha, message);
        setToast({
          kind: outcome.ok ? "ok" : "err",
          text: outcome.ok ? `Squashed into ${outcome.message}` : outcome.message,
        });
        // Rewrites local history — the caller (app.tsx) owns the separate
        // history hook and is responsible for refreshing that too.
        await refresh();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh],
  );

  const push = useCallback(
    async (opts: PushOptions = {}): Promise<PushOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      const label = opts.forceWithLease ? "Force pushing" : "Pushing";
      busyRef.current = label;
      setBusy(label);
      try {
        const outcome = await gitPush(opts);
        setToast({
          kind: outcome.ok ? "ok" : "err",
          text: outcome.ok ? `Pushed ${outcome.message}` : outcome.message,
        });
        await refresh();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh],
  );

  const pull = useCallback(async (): Promise<PullOutcome> => {
    if (busyRef.current) return { ok: false, message: "busy" };
    busyRef.current = "Pulling";
    setBusy("Pulling");
    try {
      const outcome = await gitPull();
      setToast({
        kind: outcome.ok ? "ok" : "err",
        text: outcome.ok ? `Pulled ${outcome.message}` : outcome.message,
      });
      await refresh();
      return outcome;
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, [refresh]);

  const fetch = useCallback(async (): Promise<FetchOutcome> => {
    if (busyRef.current) return { ok: false, message: "busy" };
    busyRef.current = "Fetching";
    setBusy("Fetching");
    try {
      const outcome = await gitFetch();
      setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
      // ahead/behind are relative to the remote-tracking ref fetch just moved.
      await refresh();
      return outcome;
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, [refresh]);

  const loadBranches = useCallback(async () => {
    try {
      setBranches(await listBranches());
    } catch (err) {
      setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const switchBranch = useCallback(
    async (name: string): Promise<SwitchOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Switching branch";
      setBusy("Switching branch");
      try {
        const outcome = await gitSwitchBranch(name);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        // A different branch means different status, tree, and diff — but
        // history (commit log) lives in a separate hook the caller owns, so
        // it's on the caller to refresh that too after this resolves.
        await refresh();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh],
  );

  const createBranch = useCallback(
    async (name: string): Promise<SwitchOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Creating branch";
      setBusy("Creating branch");
      try {
        const outcome = await gitCreateBranch(name);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        // New branch means a new current HEAD — same history-refresh caveat
        // as switchBranch above (the caller owns that separate hook).
        await refresh();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh],
  );

  const mergeBranch = useCallback(
    async (name: string): Promise<SwitchOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Merging branch";
      setBusy("Merging branch");
      try {
        const outcome = await gitMergeBranch(name);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        // A conflicted merge leaves MERGE_HEAD behind — refresh() picks that
        // up via getRepoState() and the conflict banner takes it from there.
        await refresh();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh],
  );

  const deleteBranch = useCallback(
    async (name: string): Promise<SwitchOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Deleting branch";
      setBusy("Deleting branch");
      try {
        const outcome = await gitDeleteBranch(name);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        // Doesn't touch the working tree (git refuses to delete the current
        // branch), just the list the picker shows.
        await loadBranches();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [loadBranches],
  );

  const loadStashes = useCallback(async () => {
    try {
      setStashes(await listStashes());
    } catch (err) {
      setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const stashPush = useCallback(
    async (message?: string): Promise<StashOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Stashing";
      setBusy("Stashing");
      try {
        const outcome = await gitStashPush(message);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        await refresh();
        await loadStashes();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh, loadStashes],
  );

  const stashPop = useCallback(
    async (ref: string): Promise<StashOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Popping stash";
      setBusy("Popping stash");
      try {
        const outcome = await gitStashPop(ref);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        await refresh();
        await loadStashes();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh, loadStashes],
  );

  const stashApply = useCallback(
    async (ref: string): Promise<StashOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Applying stash";
      setBusy("Applying stash");
      try {
        const outcome = await gitStashApply(ref);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        await refresh();
        await loadStashes();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh, loadStashes],
  );

  const stashDrop = useCallback(
    async (ref: string): Promise<StashOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Dropping stash";
      setBusy("Dropping stash");
      try {
        const outcome = await gitStashDrop(ref);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        await loadStashes();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [loadStashes],
  );

  const loadContributors = useCallback(async () => {
    try {
      setContributors(await listContributors());
    } catch (err) {
      setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const loadReflog = useCallback(async () => {
    try {
      setReflog(await listReflog());
    } catch (err) {
      setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const undoTo = useCallback(
    async (sha: string): Promise<UndoOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = "Undoing";
      setBusy("Undoing");
      try {
        const outcome = await gitResetSoftTo(sha);
        setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
        await refresh();
        await loadReflog();
        return outcome;
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [refresh, loadReflog],
  );

  const continueConflict = useCallback(async (): Promise<RepoStateOutcome> => {
    if (busyRef.current) return { ok: false, message: "busy" };
    busyRef.current = "Continuing";
    setBusy("Continuing");
    try {
      const outcome =
        repoState === "rebasing" ? await gitContinueRebase() : await gitContinueMerge();
      setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
      await refresh();
      return outcome;
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, [repoState, refresh]);

  const abortConflict = useCallback(async (): Promise<RepoStateOutcome> => {
    if (busyRef.current) return { ok: false, message: "busy" };
    busyRef.current = "Aborting";
    setBusy("Aborting");
    try {
      const outcome = repoState === "rebasing" ? await gitAbortRebase() : await gitAbortMerge();
      setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
      await refresh();
      return outcome;
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, [repoState, refresh]);

  const browse = useCallback(async () => {
    const outcome = await gHBrowse();
    setToast({ kind: outcome.ok ? "ok" : "err", text: outcome.message });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Fetch once on startup so ahead/behind (and the sync chips built on them)
  // reflect the remote's actual current state, not whatever was last fetched
  // in some earlier session — local status alone can't tell the two apart.
  useEffect(() => {
    void fetch();
  }, [fetch]);

  const selected = entries.find((e) => e.key === selectedKey) ?? null;

  return {
    status: repoStatus,
    repoState,
    continueConflict,
    abortConflict,
    entries,
    rows,
    selectedKey,
    selected,
    diff,
    diffLoading,
    hunks,
    selectedHunkIndex: clampedHunkIndex,
    moveHunk,
    toggleHunkStage,
    loading,
    error,
    toast,
    busy,
    refresh,
    select,
    move,
    toggleCollapsed,
    setCollapsed,
    toggleStage,
    stageAll,
    unstageAll,
    discardSelected,
    commit,
    squash,
    push,
    pull,
    fetch,
    branches,
    loadBranches,
    switchBranch,
    createBranch,
    deleteBranch,
    mergeBranch,
    stashes,
    loadStashes,
    stashPush,
    stashPop,
    stashApply,
    stashDrop,
    contributors,
    loadContributors,
    reflog,
    loadReflog,
    undoTo,
    setToast,
    browse,
  };
}

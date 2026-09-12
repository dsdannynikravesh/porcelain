import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  status,
  diffFile,
  stageFile,
  unstageFile,
  stageAll as gitStageAll,
  unstageAll as gitUnstageAll,
  discardFile,
  commit as gitCommit,
  type RepoStatus,
  type FileEntry,
  type FileDiff,
  type CommitOutcome,
} from "../git/index.js";
import { buildTreeRows, ancestorDirs, type TreeRow } from "./tree.js";

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
  entries: SelectableEntry[];
  /** Visible rows of the folder tree (directories + files), in display order. */
  rows: TreeRow[];
  selectedKey: string | null;
  /** The selected file, or null when a directory row (or nothing) is selected. */
  selected: SelectableEntry | null;
  diff: FileDiff | null;
  diffLoading: boolean;
  loading: boolean;
  error: string | null;
  toast: Toast | null;
  busy: boolean;
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
  setToast: (t: Toast | null) => void;
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
  const [entries, setEntries] = useState<SelectableEntry[]>([]);
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => buildTreeRows(entries, collapsedDirs), [entries, collapsedDirs]);

  const selectedKeyRef = useRef<string | null>(null);
  selectedKeyRef.current = selectedKey;
  const rowsRef = useRef<TreeRow[]>([]);
  rowsRef.current = rows;
  const collapsedRef = useRef<ReadonlySet<string>>(collapsedDirs);
  collapsedRef.current = collapsedDirs;
  const entriesRef = useRef<SelectableEntry[]>([]);
  entriesRef.current = entries;

  const diffReqRef = useRef(0);
  /** Rows as of the previous refresh, for index-based fallback selection. */
  const prevRowsRef = useRef<TreeRow[]>([]);
  /** Selection to apply on the next refresh, set by mutations. */
  const pendingSelectRef = useRef<string | null>(null);
  /** True while a git mutation + refresh is in flight. */
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await status();
      setRepoStatus(s);
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
          setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
        }
      })
      .finally(() => {
        if (diffReqRef.current === reqId) setDiffLoading(false);
      });
  }, [selectedKey, entries]);

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
    async (fn: () => Promise<void>, okText?: string) => {
      // Serialise mutations — ignore new ones while one is in flight so a burst
      // of keypresses can't act on stale state.
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await fn();
        if (okText) setToast({ kind: "ok", text: okText });
        await refresh();
      } catch (err) {
        setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );

  const toggleStage = useCallback(async () => {
    if (busyRef.current) return;
    const current = entriesRef.current.find((e) => e.key === selectedKeyRef.current);
    if (!current) return;
    const path = current.entry.path;
    const goingTo: Section = current.section === "unstaged" ? "staged" : "unstaged";
    // Follow the file across sections so a second toggle acts on the same file.
    expandAncestors(path);
    pendingSelectRef.current = `${goingTo}:${path}`;
    await runMutation(() =>
      current.section === "unstaged" ? stageFile(current.entry) : unstageFile(current.entry),
    );
  }, [runMutation, expandAncestors]);

  const stageAll = useCallback(() => runMutation(() => gitStageAll(), "Staged all changes"), [runMutation]);
  const unstageAll = useCallback(
    () => runMutation(() => gitUnstageAll(), "Unstaged everything"),
    [runMutation],
  );

  const discardSelected = useCallback(async () => {
    const current = entriesRef.current.find((e) => e.key === selectedKeyRef.current);
    if (!current) return;
    await runMutation(() => discardFile(current.entry), `Discarded ${current.entry.path}`);
  }, [runMutation]);

  const commit = useCallback(
    async (message: string, amend: boolean): Promise<CommitOutcome> => {
      if (busyRef.current) return { ok: false, message: "busy" };
      busyRef.current = true;
      setBusy(true);
      try {
        const outcome = await gitCommit(message, { amend });
        setToast({
          kind: outcome.ok ? "ok" : "err",
          text: outcome.ok ? `Committed ${outcome.message}` : outcome.message,
        });
        await refresh();
        return outcome;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = entries.find((e) => e.key === selectedKey) ?? null;

  return {
    status: repoStatus,
    entries,
    rows,
    selectedKey,
    selected,
    diff,
    diffLoading,
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
    setToast,
  };
}

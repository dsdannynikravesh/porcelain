import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CommitEntry,
  type CommitFileEntry,
  commitFileDiff,
  type FileDiff,
  filesInCommit,
  listCommits,
  resolveCommit,
} from "../git/index.js";

// Independent from state/model.ts (which is entirely working-tree/index
// concerned) — this hook owns the parallel "browsing commit history" slice
// of state: the commit list, the selected commit's changed files, and the
// diff for the selected file within that commit. Same shape of pattern as
// model.ts throughout: a `refresh` you call once on mount, and guarded async
// effects (request-id ref) so a fast burst of selection changes can't let a
// stale response clobber a newer one.

export interface HistoryModel {
  commits: CommitEntry[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  selectedSha: string | null;
  selectCommit: (sha: string) => void;
  moveCommit: (delta: number) => void;

  files: CommitFileEntry[];
  filesLoading: boolean;
  selectedPath: string | null;
  selectFile: (path: string) => void;
  moveFile: (delta: number) => void;

  diff: FileDiff | null;
  diffLoading: boolean;

  /** Commit-message search in effect ("" for none). */
  query: string;
  /** Re-lists history filtered to `query` (case-insensitive message match, or
   *  the commit a sha/ref names), starting again from the first page. */
  setQuery: (query: string) => void;

  refresh: () => Promise<void>;
}

/** Text worth also trying as a commit ref — a plausible sha prefix. */
const looksLikeSha = (q: string) => /^[0-9a-f]{4,40}$/i.test(q);

export function useCommitHistory(): HistoryModel {
  const PAGE_SIZE = 100;
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  const [files, setFiles] = useState<CommitFileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [query, setQueryState] = useState("");

  const commitsRef = useRef<CommitEntry[]>([]);
  commitsRef.current = commits;
  const selectedShaRef = useRef<string | null>(null);
  selectedShaRef.current = selectedSha;
  const filesRef = useRef<CommitFileEntry[]>([]);
  filesRef.current = files;
  const selectedPathRef = useRef<string | null>(null);
  selectedPathRef.current = selectedPath;

  const filesReqRef = useRef(0);
  const diffReqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const nextSkipRef = useRef(0);
  const queryRef = useRef("");

  const refresh = useCallback(async () => {
    try {
      const q = queryRef.current;
      const [list, shaMatch] = await Promise.all([
        listCommits(PAGE_SIZE, 0, { grep: q || undefined }),
        q && looksLikeSha(q) ? resolveCommit(q) : Promise.resolve(null),
      ]);
      if (queryRef.current !== q) return; // the search changed while this ran
      // A sha match goes first unless the message search found it anyway. It
      // isn't part of the paged `git log` results, so it's left out of the
      // skip count below.
      const extra = shaMatch && !list.some((c) => c.sha === shaMatch.sha) ? [shaMatch] : [];
      // A watch refresh happens independently of paging. Keep pages that have
      // already been fetched instead of snapping back to the first 100 commits
      // (and losing the user's selection) whenever the worktree changes.
      const olderLoaded = commitsRef.current.slice(extra.length + PAGE_SIZE);
      const known = new Set([...extra, ...list].map((commit) => commit.sha));
      const merged = [...extra, ...list, ...olderLoaded.filter((commit) => !known.has(commit.sha))];
      const hadMore = hasMoreRef.current;
      nextSkipRef.current = merged.length - extra.length;
      hasMoreRef.current = list.length === PAGE_SIZE && (olderLoaded.length === 0 || hadMore);
      setCommits(merged);
      setError(null);
      // Keep the current selection if it's still around, otherwise land on HEAD.
      setSelectedSha((prev) =>
        prev && merged.some((c) => c.sha === prev) ? prev : (merged[0]?.sha ?? null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Load the changed-file list whenever the selected commit changes.
  useEffect(() => {
    if (!selectedSha) {
      setFiles([]);
      setSelectedPath(null);
      return;
    }
    const reqId = ++filesReqRef.current;
    setFilesLoading(true);
    filesInCommit(selectedSha)
      .then((list) => {
        if (filesReqRef.current !== reqId) return;
        setFiles(list);
        setSelectedPath((prev) =>
          prev && list.some((f) => f.path === prev) ? prev : (list[0]?.path ?? null),
        );
      })
      .catch(() => {
        if (filesReqRef.current === reqId) setFiles([]);
      })
      .finally(() => {
        if (filesReqRef.current === reqId) setFilesLoading(false);
      });
  }, [selectedSha]);

  // Load the diff for the selected file within the selected commit.
  useEffect(() => {
    if (!selectedSha || !selectedPath) {
      setDiff(null);
      return;
    }
    const current = files.find((f) => f.path === selectedPath);
    const reqId = ++diffReqRef.current;
    setDiffLoading(true);
    commitFileDiff(selectedSha, selectedPath, current?.origPath)
      .then((d) => {
        if (diffReqRef.current === reqId) setDiff(d);
      })
      .catch(() => {
        if (diffReqRef.current === reqId) setDiff(null);
      })
      .finally(() => {
        if (diffReqRef.current === reqId) setDiffLoading(false);
      });
  }, [selectedSha, selectedPath, files]);

  const selectCommit = useCallback((sha: string) => {
    selectedShaRef.current = sha;
    setSelectedSha(sha);
  }, []);

  const moveCommit = useCallback(
    (delta: number) => {
      const list = commitsRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex((c) => c.sha === selectedShaRef.current);
      const nextIdx = Math.min(Math.max((idx < 0 ? 0 : idx) + delta, 0), list.length - 1);
      const next = list[nextIdx];
      if (next && nextIdx !== list.length - 1) {
        selectCommit(next.sha);
        return;
      }

      // At the end of the loaded page, fetch the next page before moving on.
      // This keeps navigation one commit at a time without loading the entire
      // repository history up front.
      if (delta > 0 && nextIdx === list.length - 1 && hasMoreRef.current) {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        void listCommits(PAGE_SIZE, nextSkipRef.current, {
          grep: queryRef.current || undefined,
        })
          .then((more) => {
            nextSkipRef.current += more.length;
            hasMoreRef.current = more.length === PAGE_SIZE;
            if (more.length === 0) return;
            setCommits((prev) => [...prev, ...more]);
            selectCommit(more[0]!.sha);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => {
            loadingMoreRef.current = false;
            setLoadingMore(false);
          });
      } else if (next) {
        selectCommit(next.sha);
      }
    },
    [selectCommit],
  );

  const setQuery = useCallback(
    (next: string) => {
      if (next === queryRef.current) return;
      queryRef.current = next;
      setQueryState(next);
      // Start over: drop every loaded page so refresh() doesn't merge results
      // from the previous search back in.
      commitsRef.current = [];
      hasMoreRef.current = true;
      nextSkipRef.current = 0;
      selectedShaRef.current = null;
      setCommits([]);
      setSelectedSha(null);
      setLoading(true);
      void refresh();
    },
    [refresh],
  );

  const selectFile = useCallback((path: string) => {
    selectedPathRef.current = path;
    setSelectedPath(path);
  }, []);

  const moveFile = useCallback(
    (delta: number) => {
      const list = filesRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex((f) => f.path === selectedPathRef.current);
      const nextIdx = Math.min(Math.max((idx < 0 ? 0 : idx) + delta, 0), list.length - 1);
      const next = list[nextIdx];
      if (next) selectFile(next.path);
    },
    [selectFile],
  );

  return {
    commits,
    loading,
    loadingMore,
    error,
    selectedSha,
    selectCommit,
    moveCommit,
    files,
    filesLoading,
    selectedPath,
    selectFile,
    moveFile,
    diff,
    diffLoading,
    query,
    setQuery,
    refresh,
  };
}

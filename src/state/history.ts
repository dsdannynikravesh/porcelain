import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CommitEntry,
  type CommitFileEntry,
  commitFileDiff,
  type FileDiff,
  filesInCommit,
  listCommits,
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

  refresh: () => Promise<void>;
}

export function useCommitHistory(): HistoryModel {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  const [files, setFiles] = useState<CommitFileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

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

  const refresh = useCallback(async () => {
    try {
      const list = await listCommits();
      setCommits(list);
      setError(null);
      // Keep the current selection if it's still around, otherwise land on HEAD.
      setSelectedSha((prev) =>
        prev && list.some((c) => c.sha === prev) ? prev : (list[0]?.sha ?? null),
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
      if (next) selectCommit(next.sha);
    },
    [selectCommit],
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
    refresh,
  };
}

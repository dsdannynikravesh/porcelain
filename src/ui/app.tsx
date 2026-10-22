import type { KeyEvent } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type GitHubReference, listOpenReferences } from "../gh/index.js";
import {
  type CommitEntry,
  checkoutName,
  defaultPushRemote,
  getGitCwd,
  isChangeLine,
  lastCommitMessage,
  listCommits,
  operationName,
  withCoAuthors,
} from "../git/index.js";
import { useCommitHistory } from "../state/history.js";
import { useRepoModel } from "../state/model.js";
import { useRepoWatch } from "../state/watch.js";
import { BranchPicker } from "./branch-picker.js";
import { CherryPickPicker } from "./cherry-pick-picker.js";
import { CoAuthorPicker } from "./co-author-picker.js";
import { CommitBox, type CommitBoxHandle, type CommitField } from "./commit-box.js";
import { Confirm, type ConfirmRequest } from "./confirm.js";
import { ConflictResolution } from "./conflict-resolution.js";
import { DiffPanel, type DiffScrollHandle } from "./diff-panel.js";
import { FolderDiffPanel } from "./folder-diff-panel.js";
import { HELP_MODAL_WIDTH, HelpFooter } from "./help-footer.js";
import { LineSelectPanel } from "./line-select-panel.js";
import { firstHunkLine, openInEditor } from "./open-editor.js";
import { ReferencePicker } from "./reference-picker.js";
import { ReflogPicker } from "./reflog-picker.js";
import { StashPicker } from "./stash-picker.js";
import { StatusBar } from "./status-bar.js";
import { StatusPanelCommits } from "./status-panel/commits.js";
import { StatusPanel, type StatusTab } from "./status-panel/index.js";
import { TextPrompt, type TextPromptHandle } from "./text-prompt.js";
import { theme } from "./theme.js";

export type Focus = "list" | "commit";
/** Which of the two history-mode panes (commit list vs. its files) has j/k. */
type HistoryFocus = "commits" | "files";

/** Match a KeyEvent against a target like "a", "A" (shift+a), "space", "escape". */
function isKey(key: KeyEvent, target: string): boolean {
  // App hotkeys are deliberately plain keystrokes. Modifiers belong to the
  // focused input (or an explicitly handled shortcut such as Ctrl+G in the
  // commit composer), never to navigation/staging actions.
  if (key.ctrl || key.meta || key.option) return false;
  if (target.length === 1 && target >= "A" && target <= "Z") {
    return key.name === target.toLowerCase() && key.shift;
  }
  if (target.length === 1 && target >= "a" && target <= "z") {
    return key.name === target && !key.shift;
  }
  return key.name === target;
}

export function App() {
  const model = useRepoModel();
  const history = useCommitHistory();
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();

  const [focus, setFocus] = useState<Focus>("list");
  const [statusTab, setStatusTab] = useState<StatusTab>("changes");
  const [historyFocus, setHistoryFocus] = useState<HistoryFocus>("commits");
  const [amend, setAmend] = useState(false);
  /** Which of the commit box's two fields has keyboard focus, while `focus === "commit"`. */
  const [commitField, setCommitField] = useState<CommitField>("summary");
  /** Set while squashing: the oldest commit being folded in, and how many total. */
  const [squash, setSquash] = useState<{ baseSha: string; count: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [diffView, setDiffView] = useState<"split" | "unified">("split");
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrapDiff, setWrapDiff] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [showBranches, setShowBranches] = useState(false);
  const [branchIndex, setBranchIndex] = useState(0);
  const [showNewBranch, setShowNewBranch] = useState(false);
  /** The `/` filter prompt — files in the changes tab, commits in history. */
  const [showFilter, setShowFilter] = useState(false);
  const [showStash, setShowStash] = useState(false);
  const [stashIndex, setStashIndex] = useState(0);
  const [showCoAuthors, setShowCoAuthors] = useState(false);
  const [coAuthorIndex, setCoAuthorIndex] = useState(0);
  const [showReflog, setShowReflog] = useState(false);
  const [reflogIndex, setReflogIndex] = useState(0);
  const [referenceQuery, setReferenceQuery] = useState<string | null>(null);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [references, setReferences] = useState<GitHubReference[] | null>(null);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referenceIndex, setReferenceIndex] = useState(0);
  /** Set while the cherry-pick picker is open: the source branch and its commits (null while loading). */
  const [cherryPick, setCherryPick] = useState<{
    branch: string;
    commits: CommitEntry[] | null;
  } | null>(null);
  const [cherryIndex, setCherryIndex] = useState(0);
  const [cherryChecked, setCherryChecked] = useState<ReadonlySet<string>>(new Set());
  /** Line mode (`V`): pick individual +/- lines of the selected hunk to stage.
   *  Holds the file key it was opened on, so selecting anything else (or
   *  leaving the changes tab) ends it without a separate reset effect. */
  const [lineModeKey, setLineModeKey] = useState<string | null>(null);
  /** Index into the selected hunk's `lines` — always a change line. */
  const [lineCursor, setLineCursorState] = useState(0);
  const [lineSelected, setLineSelectedState] = useState<ReadonlySet<number>>(new Set());
  // Mirrored in refs, updated synchronously, so a burst of keypresses that
  // lands before the next render ("space j space") each sees the last one's
  // result instead of a stale closure — same idea as model.ts's selection.
  const lineCursorRef = useRef(0);
  const lineSelectedRef = useRef<ReadonlySet<number>>(new Set());
  const setLineCursor = useCallback((i: number) => {
    lineCursorRef.current = i;
    setLineCursorState(i);
  }, []);
  const setLineSelected = useCallback((next: ReadonlySet<number>) => {
    lineSelectedRef.current = next;
    setLineSelectedState(next);
  }, []);
  const [conflictIndex, setConflictIndex] = useState(0);
  /** Emails checked for the commit currently being composed. */
  const [coAuthors, setCoAuthors] = useState<ReadonlySet<string>>(new Set());
  const pickedCoAuthors = useMemo(
    () => model.contributors.filter((c) => coAuthors.has(c.email)),
    [model.contributors, coAuthors],
  );

  const commitRef = useRef<CommitBoxHandle>(null);
  const newBranchRef = useRef<TextPromptHandle>(null);
  const filterRef = useRef<TextPromptHandle>(null);
  const diffScrollRef = useRef<DiffScrollHandle>(null);

  const refresh = model.refresh;
  const refreshHistory = history.refresh;
  useRepoWatch(
    useCallback(() => {
      void refresh();
      void refreshHistory();
    }, [refresh, refreshHistory]),
  );

  // Auto-dismiss toasts.
  useEffect(() => {
    if (!model.toast) return;
    const t = setTimeout(() => model.setToast(null), 4000);
    return () => clearTimeout(t);
  }, [model.toast, model.setToast]);

  const listWidth = Math.max(24, Math.min(42, Math.floor(width * 0.22)));
  const commitsWidth = Math.max(24, Math.min(42, Math.floor(width * 0.22)));
  const diffWidth = Math.max(20, width - listWidth - (statusTab === "history" ? commitsWidth : 0));
  const stagedCount = model.status?.staged.length ?? 0;
  const conflictEntries = useMemo(
    () => model.entries.filter((item) => item.entry.unmerged),
    [model.entries],
  );
  const pendingConflictEntries = useMemo(
    () => model.entries.filter((item) => !item.entry.unmerged && item.section === "unstaged"),
    [model.entries],
  );
  const conflictActionEntries =
    conflictEntries.length > 0 ? conflictEntries : pendingConflictEntries;

  useEffect(() => {
    setConflictIndex((index) => Math.max(0, Math.min(index, conflictActionEntries.length - 1)));
  }, [conflictActionEntries.length]);
  const referenceSuggestions = useMemo(() => {
    if (referenceQuery === null || !references) return [];
    const query = referenceQuery.toLowerCase();
    return references
      .filter(
        (reference) =>
          String(reference.number).startsWith(query) ||
          reference.title.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [referenceQuery, references]);

  useEffect(() => {
    if (referenceQuery === null || references) return;
    let current = true;
    setReferencesLoading(true);
    void listOpenReferences()
      .then((result) => {
        if (current) setReferences(result);
      })
      .catch(() => {
        // GitHub completion is optional; a missing `gh` login should never
        // interfere with composing a normal commit message.
        if (current) setReferences([]);
      })
      .finally(() => {
        if (current) setReferencesLoading(false);
      });
    return () => {
      current = false;
    };
  }, [referenceQuery, references]);

  const currentHunk = model.hunks[model.selectedHunkIndex] ?? null;
  const changeLines = useMemo(
    () => currentHunk?.lines.flatMap((l, i) => (isChangeLine(l) ? [i] : [])) ?? [],
    [currentHunk],
  );

  // A different hunk (or the same file re-diffed after staging some of it)
  // starts over on its first change line with nothing picked — and once
  // there's nothing left to pick on this side, line mode is done.
  useEffect(() => {
    setLineCursor(changeLines[0] ?? 0);
    setLineSelected(new Set());
    if (changeLines.length === 0) setLineModeKey(null);
  }, [changeLines, setLineCursor, setLineSelected]);

  const lineMode =
    lineModeKey !== null && lineModeKey === model.selectedKey && statusTab === "changes";

  const moveLineCursor = useCallback(
    (delta: number) => {
      const at = changeLines.indexOf(lineCursorRef.current);
      const next = changeLines[Math.max(0, Math.min(at + delta, changeLines.length - 1))];
      if (next !== undefined) setLineCursor(next);
    },
    [changeLines, setLineCursor],
  );

  const enterCommit = useCallback(() => {
    setCommitField("summary");
    setFocus("commit");
  }, []);

  const cancelCommit = useCallback(() => {
    setFocus("list");
    setAmend(false);
    setSquash(null);
    setCoAuthors(new Set());
    setCommitField("summary");
    commitRef.current?.clear();
  }, []);

  const runGenerate = useCallback(() => {
    void (async () => {
      const result = await model.generateCommitMessage();
      if (result) commitRef.current?.setGenerated(result.title, result.description);
    })();
  }, [model]);

  const doCommit = useCallback(async () => {
    const message = commitRef.current?.getText() ?? "";
    if (!message.trim() && !amend) {
      model.setToast({ kind: "err", text: "Write a commit message first" });
      return;
    }
    const outcome = await model.commit(withCoAuthors(message, pickedCoAuthors), amend);
    if (outcome.ok) {
      commitRef.current?.clear();
      setAmend(false);
      setCoAuthors(new Set());
      setFocus("list");
    }
  }, [amend, model, pickedCoAuthors]);

  const requestCommit = useCallback(() => {
    if (amend) {
      const message = commitRef.current?.getText() ?? "";
      setConfirm({
        title: "Amend last commit",
        body: "This rewrites the most recent commit. Don't do it if you've already pushed it.",
        command: `git commit --amend -m ${JSON.stringify(message.trim() || " ")}`,
        danger: true,
        run: doCommit,
      });
    } else {
      void doCommit();
    }
  }, [amend, doCommit]);

  const startAmend = useCallback(async () => {
    const prev = await lastCommitMessage();
    commitRef.current?.setText(prev);
    setAmend(true);
    setCommitField("summary");
    setFocus("commit");
  }, []);

  const startSquash = useCallback(() => {
    const idx = history.commits.findIndex((c) => c.sha === history.selectedSha);
    if (idx <= 0) {
      model.setToast({ kind: "err", text: "Select an older commit to squash into" });
      return;
    }
    if (model.entries.length > 0) {
      model.setToast({ kind: "err", text: "Commit or discard your changes before squashing" });
      return;
    }
    const range = history.commits.slice(0, idx + 1);
    // Oldest-first, matching the order they'll read in once combined.
    const message = range
      .slice()
      .reverse()
      .map((c) => c.subject)
      .join("\n");
    commitRef.current?.setText(message);
    setSquash({ baseSha: history.selectedSha!, count: range.length });
    setCommitField("summary");
    setFocus("commit");
  }, [history, model]);

  const doSquash = useCallback(async () => {
    if (!squash) return;
    const message = commitRef.current?.getText() ?? "";
    if (!message.trim()) {
      model.setToast({ kind: "err", text: "Write a commit message first" });
      return;
    }
    const outcome = await model.squash(squash.baseSha, withCoAuthors(message, pickedCoAuthors));
    if (outcome.ok) {
      commitRef.current?.clear();
      setSquash(null);
      setCoAuthors(new Set());
      setFocus("list");
      void history.refresh();
    }
  }, [squash, model, history, pickedCoAuthors]);

  const requestSquash = useCallback(() => {
    if (!squash) return;
    setConfirm({
      title: "Squash commits",
      body: `Combine the last ${squash.count} commits into one. Don't do this if you've already pushed any of them, unless you're ready to force-push after.`,
      // Displayed only — abbreviated so the single-line command box (no
      // room to wrap) doesn't silently drop the tail of a full 40-char sha.
      // model.squash still gets the full squash.baseSha below.
      command: `git reset --soft ${squash.baseSha.slice(0, 7)}^ && git commit -m <message>`,
      danger: true,
      run: doSquash,
    });
  }, [squash, doSquash]);

  const openSelectedInEditor = useCallback(async () => {
    const sel = model.selected;
    if (!sel) return;
    await openInEditor(renderer, {
      file: sel.entry.path,
      line: model.diff ? firstHunkLine(model.diff.patch) : undefined,
      cwd: getGitCwd(),
    });
    void model.refresh();
  }, [model, renderer]);

  const openConflictInEditor = useCallback(
    async (path: string) => {
      await openInEditor(renderer, { file: path, cwd: getGitCwd() });
      void model.refresh();
    },
    [model, renderer],
  );

  const openBranchPicker = useCallback(() => {
    setShowBranches(true);
    void model.loadBranches();
  }, [model]);

  // Once the list loads, start the cursor on whichever branch is current.
  useEffect(() => {
    if (!showBranches) return;
    const idx = model.branches.findIndex((b) => b.current);
    setBranchIndex(idx >= 0 ? idx : 0);
  }, [showBranches, model.branches]);

  const submitNewBranch = useCallback(() => {
    const name = newBranchRef.current?.getValue().trim() ?? "";
    if (!name) return;
    setShowNewBranch(false);
    setShowBranches(false);
    void (async () => {
      await model.createBranch(name);
      void history.refresh();
    })();
  }, [model, history]);

  const requestDeleteBranch = useCallback(() => {
    const target = model.branches[branchIndex];
    if (!target) return;
    if (target.remote) {
      model.setToast({ kind: "err", text: "Not checked out locally — nothing to delete" });
      return;
    }
    if (target.current) {
      model.setToast({ kind: "err", text: "Can't delete the branch you're on" });
      return;
    }
    setConfirm({
      title: "Delete branch",
      body: `Permanently delete local branch "${target.name}". Refuses if it isn't fully merged into the current branch.`,
      command: `git branch -d ${target.name}`,
      danger: true,
      run: async () => {
        await model.deleteBranch(target.name);
      },
    });
  }, [model, branchIndex]);

  const requestMergeBranch = useCallback(() => {
    const target = model.branches[branchIndex];
    if (!target) return;
    if (target.current) {
      model.setToast({ kind: "err", text: "Already on this branch" });
      return;
    }
    const name = checkoutName(target);
    setConfirm({
      title: "Merge branch",
      body: `Merges ${name} into your current branch. If it conflicts, resolve it like any other conflict — a banner will guide you through it.`,
      command: `git merge --no-edit ${name}`,
      danger: true,
      run: async () => {
        setShowBranches(false);
        await model.mergeBranch(name);
        void history.refresh();
      },
    });
  }, [model, branchIndex, history]);

  const openCherryPick = useCallback(() => {
    const target = model.branches[branchIndex];
    if (!target) return;
    if (target.current) {
      model.setToast({ kind: "err", text: "Pick a different branch to cherry-pick from" });
      return;
    }
    setShowBranches(false);
    setCherryPick({ branch: target.name, commits: null });
    setCherryIndex(0);
    setCherryChecked(new Set());
    void listCommits(200, 0, { notInHead: target.name })
      .then((commits) =>
        setCherryPick((cur) => (cur?.branch === target.name ? { ...cur, commits } : cur)),
      )
      .catch((err) => {
        setCherryPick(null);
        model.setToast({ kind: "err", text: err instanceof Error ? err.message : String(err) });
      });
  }, [model, branchIndex]);

  const requestCherryPick = useCallback(() => {
    const commits = cherryPick?.commits;
    if (!commits || commits.length === 0) return;
    // Nothing checked means "just the one under the cursor", like the stash
    // picker acting on its current row. Applied oldest-first either way, so
    // a run of dependent commits lands in the order it was written.
    const picked =
      cherryChecked.size > 0
        ? commits.filter((c) => cherryChecked.has(c.sha))
        : commits.slice(cherryIndex, cherryIndex + 1);
    const shas = picked.map((c) => c.sha).reverse();
    if (shas.length === 0) return;
    setConfirm({
      title: "Cherry-pick",
      body: `Apply ${shas.length} commit${shas.length === 1 ? "" : "s"} from ${cherryPick.branch} onto your current branch. If one conflicts, the conflict dialog takes over.`,
      command: `git cherry-pick ${picked
        .map((c) => c.shortSha)
        .reverse()
        .join(" ")}`,
      run: async () => {
        setCherryPick(null);
        await model.cherryPick(shas);
        void history.refresh();
      },
    });
  }, [cherryPick, cherryChecked, cherryIndex, model, history]);

  const requestRevert = useCallback(() => {
    const target = history.commits.find((c) => c.sha === history.selectedSha);
    if (!target) return;
    if (model.entries.length > 0) {
      model.setToast({ kind: "err", text: "Commit or stash your changes before reverting" });
      return;
    }
    setConfirm({
      title: "Revert commit",
      body: `Adds a new commit that undoes ${target.shortSha} ("${target.subject}"). History is kept, so this is safe even if it's already pushed.`,
      command: `git revert --no-edit ${target.shortSha}`,
      run: async () => {
        await model.revert(target.sha);
        void history.refresh();
      },
    });
  }, [history, model]);

  const openStashPicker = useCallback(() => {
    setShowStash(true);
    setStashIndex(0);
    void model.loadStashes();
  }, [model]);

  const openCoAuthorPicker = useCallback(() => {
    setShowCoAuthors(true);
    setCoAuthorIndex(0);
    void model.loadContributors();
  }, [model]);

  const openReflogPicker = useCallback(() => {
    setShowReflog(true);
    setReflogIndex(0);
    void model.loadReflog();
  }, [model]);

  const requestUndo = useCallback(() => {
    const target = model.reflog[reflogIndex];
    if (!target) return;
    setConfirm({
      title: "Undo to here",
      body: `Moves HEAD back to ${target.shortSha} (${target.action}). Nothing is lost — everything since then comes back as staged changes.`,
      command: `git reset --soft ${target.shortSha}`,
      danger: true,
      run: async () => {
        setShowReflog(false);
        await model.undoTo(target.sha);
      },
    });
  }, [model, reflogIndex]);

  const requestStashDrop = useCallback(() => {
    const target = model.stashes[stashIndex];
    if (!target) return;
    setConfirm({
      title: "Drop stash",
      body: `Permanently delete ${target.ref} (${target.subject}). This cannot be undone.`,
      command: `git stash drop ${target.ref}`,
      danger: true,
      run: async () => {
        await model.stashDrop(target.ref);
      },
    });
  }, [model, stashIndex]);

  const requestAbortConflict = useCallback(() => {
    if (model.repoState === "clean") return;
    const kind = operationName(model.repoState);
    setConfirm({
      title: `Abort ${kind}`,
      body: `Stops the ${kind} and puts things back exactly how they were before it started. Any conflict resolutions you've made so far are discarded.`,
      command: `git ${kind} --abort`,
      danger: true,
      run: async () => {
        await model.abortConflict();
      },
    });
  }, [model]);

  const requestForcePush = useCallback(() => {
    setConfirm({
      title: "Force push",
      body: "Overwrites the remote branch with your local history — for after an amend or rebase. Safe against clobbering unseen work (git still refuses if the remote moved since your last fetch), but collaborators who already pulled the old history will need to reset to it.",
      command: "git push --force-with-lease",
      danger: true,
      run: async () => {
        await model.push({ forceWithLease: true });
      },
    });
  }, [model]);

  // A plain `git push` refuses outright on a branch with no upstream, so the
  // first push of a new branch publishes it instead (-u), with a confirm
  // since it's creating something on the remote, not just updating it.
  const requestPush = useCallback(async () => {
    const s = model.status;
    if (!s || s.upstream || s.detached || !s.branch) {
      void model.push();
      return;
    }
    const branch = s.branch;
    const remote = await defaultPushRemote().catch(() => null);
    if (!remote) {
      model.setToast({
        kind: "err",
        text: "No remote to publish to — add one with git remote add",
      });
      return;
    }
    setConfirm({
      title: "Publish branch",
      body: `"${branch}" doesn't exist on ${remote} yet. Push it and set it as this branch's upstream?`,
      command: `git push -u ${remote} ${branch}`,
      run: async () => {
        await model.push({ setUpstream: { remote, branch } });
      },
    });
  }, [model]);

  // OSC 52 goes through the terminal itself, so this works over SSH and
  // inside tmux (with set-clipboard on) — but some terminals ignore it.
  const copy = useCallback(
    (text: string | null | undefined, what: string) => {
      if (!text) return;
      const ok = renderer.copyToClipboardOSC52(text);
      model.setToast(
        ok
          ? { kind: "ok", text: `Copied ${what}` }
          : { kind: "err", text: "This terminal doesn't support clipboard copy (OSC 52)" },
      );
    },
    [renderer, model],
  );

  const requestDiscard = useCallback(() => {
    const sel = model.selected;
    if (!sel) return;
    const untracked = sel.entry.untracked;
    setConfirm({
      title: "Discard changes",
      body: untracked
        ? `Delete untracked file "${sel.entry.path}"? This cannot be undone.`
        : `Throw away all uncommitted changes to "${sel.entry.path}"? This cannot be undone.`,
      command: untracked
        ? `git clean -f -- ${sel.entry.path}`
        : `git checkout -- ${sel.entry.path}`,
      danger: true,
      run: () => model.discardSelected(),
    });
  }, [model]);

  useKeyboard((key: KeyEvent) => {
    // 1. Confirm modal owns all input while open.
    if (confirm) {
      if (isKey(key, "y")) {
        const req = confirm;
        setConfirm(null);
        void req.run();
      } else if (isKey(key, "n") || isKey(key, "escape")) {
        setConfirm(null);
      }
      return;
    }

    // 2. A stopped merge/rebase blocks ordinary navigation until every
    // conflicted file is resolved and staged. Abort remains available through
    // the usual confirmation path.
    if (model.repoState !== "clean") {
      const conflict = conflictActionEntries[conflictIndex];
      if (isKey(key, "G")) {
        requestAbortConflict();
      } else if (isKey(key, "r")) {
        void model.refresh();
      } else if (conflict && (isKey(key, "up") || isKey(key, "down"))) {
        setConflictIndex((index) => {
          const delta = isKey(key, "up") ? -1 : 1;
          return Math.max(0, Math.min(index + delta, conflictActionEntries.length - 1));
        });
      } else if (conflict && isKey(key, "e")) {
        void openConflictInEditor(conflict.entry.path);
      } else if (conflict && isKey(key, "space")) {
        model.select(conflict.key);
        void model.toggleStage();
      } else if (conflict && isKey(key, "g")) {
        // Match GitHub Desktop's flow: once the user has saved the resolution,
        // `g` stages only the formerly-conflicted files, then continues.
        void (async () => {
          if (conflictEntries.length > 0) {
            if (await model.stageConflictFiles()) await model.continueConflict();
          } else {
            model.select(conflict.key);
            await model.toggleStage();
            await model.continueConflict();
          }
        })();
      } else if (conflict && isKey(key, "c")) {
        model.setToast({
          kind: "err",
          text: "Stage the remaining worktree changes first",
        });
      } else if (!conflict && (isKey(key, "c") || isKey(key, "g"))) {
        void model.continueConflict();
      }
      return;
    }

    // 3. Help overlay.
    if (showHelp) {
      if (isKey(key, "escape") || key.name === "?" || (key.name === "/" && key.shift)) {
        setShowHelp(false);
      }
      return;
    }

    // 3. New-branch name prompt — let the input have the keys, only intercept these.
    if (showNewBranch) {
      if (isKey(key, "escape")) {
        setShowNewBranch(false);
      } else if (isKey(key, "return")) {
        submitNewBranch();
      }
      return;
    }

    // 3b. Filter prompt — same deal as the branch-name prompt.
    if (showFilter) {
      if (isKey(key, "escape")) {
        setShowFilter(false);
      } else if (isKey(key, "return")) {
        const value = filterRef.current?.getValue().trim() ?? "";
        setShowFilter(false);
        if (statusTab === "history") history.setQuery(value);
        else model.setFilter(value);
      }
      return;
    }

    // 4. Branch picker owns all input while open.
    if (showBranches) {
      if (isKey(key, "escape")) {
        setShowBranches(false);
      } else if (isKey(key, "j") || isKey(key, "down")) {
        setBranchIndex((i) => Math.min(i + 1, model.branches.length - 1));
      } else if (isKey(key, "k") || isKey(key, "up")) {
        setBranchIndex((i) => Math.max(i - 1, 0));
      } else if (isKey(key, "return") || isKey(key, "space")) {
        const target = model.branches[branchIndex];
        setShowBranches(false);
        if (target && !target.current) {
          void (async () => {
            await model.switchBranch(checkoutName(target));
            void history.refresh();
          })();
        }
      } else if (isKey(key, "n")) {
        setShowNewBranch(true);
      } else if (isKey(key, "m")) {
        requestMergeBranch();
      } else if (isKey(key, "d")) {
        requestDeleteBranch();
      } else if (isKey(key, "c")) {
        openCherryPick();
      }
      return;
    }

    // 4b. Cherry-pick picker owns all input while open.
    if (cherryPick) {
      const commits = cherryPick.commits ?? [];
      if (isKey(key, "escape")) {
        setCherryPick(null);
      } else if (isKey(key, "j") || isKey(key, "down")) {
        setCherryIndex((i) => Math.min(i + 1, commits.length - 1));
      } else if (isKey(key, "k") || isKey(key, "up")) {
        setCherryIndex((i) => Math.max(i - 1, 0));
      } else if (isKey(key, "space")) {
        const sha = commits[cherryIndex]?.sha;
        if (sha) {
          setCherryChecked((prev) => {
            const next = new Set(prev);
            if (next.has(sha)) next.delete(sha);
            else next.add(sha);
            return next;
          });
        }
      } else if (isKey(key, "return")) {
        requestCherryPick();
      }
      return;
    }

    // 5. Stash picker owns all input while open.
    if (showStash) {
      const canStash = model.entries.length > 0;
      if (isKey(key, "escape")) {
        setShowStash(false);
      } else if (isKey(key, "j") || isKey(key, "down")) {
        setStashIndex((i) => Math.min(i + 1, model.stashes.length - 1));
      } else if (isKey(key, "k") || isKey(key, "up")) {
        setStashIndex((i) => Math.max(i - 1, 0));
      } else if (isKey(key, "n")) {
        if (canStash) void model.stashPush();
      } else if (isKey(key, "p")) {
        const target = model.stashes[stashIndex];
        if (target) {
          setShowStash(false);
          void model.stashPop(target.ref);
        }
      } else if (isKey(key, "a")) {
        const target = model.stashes[stashIndex];
        if (target) {
          setShowStash(false);
          void model.stashApply(target.ref);
        }
      } else if (isKey(key, "d")) {
        requestStashDrop();
      }
      return;
    }

    // 6. Reflog (undo) picker owns all input while open.
    if (showReflog) {
      if (isKey(key, "escape")) {
        setShowReflog(false);
      } else if (isKey(key, "j") || isKey(key, "down")) {
        setReflogIndex((i) => Math.min(i + 1, model.reflog.length - 1));
      } else if (isKey(key, "k") || isKey(key, "up")) {
        setReflogIndex((i) => Math.max(i - 1, 0));
      } else if (isKey(key, "return")) {
        requestUndo();
      }
      return;
    }

    // 7. Co-author picker owns all input while open (opened from list mode
    // via "C" — see priority 8 below. Not opened from inside the commit box:
    // any key safe to intercept there would also just type into the message).
    if (showCoAuthors) {
      if (isKey(key, "escape")) {
        setShowCoAuthors(false);
      } else if (key.name === "return") {
        setShowCoAuthors(false);
        enterCommit();
      } else if (isKey(key, "j") || isKey(key, "down")) {
        setCoAuthorIndex((i) => Math.min(i + 1, model.contributors.length - 1));
      } else if (isKey(key, "k") || isKey(key, "up")) {
        setCoAuthorIndex((i) => Math.max(i - 1, 0));
      } else if (isKey(key, "space")) {
        const c = model.contributors[coAuthorIndex];
        if (c) {
          setCoAuthors((prev) => {
            const next = new Set(prev);
            if (next.has(c.email)) next.delete(c.email);
            else next.add(c.email);
            return next;
          });
        }
      }
      return;
    }

    // 8. GitHub issue/PR completion owns navigation only while its dropdown
    // is visible. Letter keys deliberately keep going to the commit field.
    if (
      focus === "commit" &&
      referenceOpen &&
      (referencesLoading || referenceSuggestions.length > 0)
    ) {
      if (isKey(key, "escape")) {
        key.preventDefault();
        setReferenceOpen(false);
        return;
      } else if ((isKey(key, "up") || isKey(key, "down")) && referenceSuggestions.length > 0) {
        key.preventDefault();
        setReferenceIndex((index) => {
          const delta = isKey(key, "up") ? -1 : 1;
          return Math.max(0, Math.min(index + delta, referenceSuggestions.length - 1));
        });
        return;
      } else if (isKey(key, "return") && referenceSuggestions.length > 0) {
        key.preventDefault();
        const reference = referenceSuggestions[referenceIndex];
        if (reference) commitRef.current?.insertReference(reference.number);
        setReferenceOpen(false);
        return;
      }
    }

    // 9. Commit editor mode — let the summary/description fields have the
    // keys, only intercept a few. Tab steps forward through summary ->
    // description -> back to the list (leaving the box); Shift+Tab steps
    // the same sequence in reverse.
    if (focus === "commit") {
      if (isKey(key, "escape")) {
        cancelCommit();
      } else if (key.name === "g" && key.ctrl) {
        runGenerate();
      } else if (key.name === "return" && key.ctrl) {
        // Commits from either field — the description needs this since its
        // own plain Enter means "newline", not "submit".
        if (squash) requestSquash();
        else requestCommit();
      } else if (key.name === "return" && !key.shift && !key.ctrl) {
        if (commitField === "description") commitRef.current?.insertNewline();
        else if (squash) requestSquash();
        else requestCommit();
      } else if (key.name === "return" && key.shift) {
        commitRef.current?.insertNewline();
      } else if (key.name === "tab" && !key.shift) {
        key.preventDefault();
        if (commitField === "summary") setCommitField("description");
        else setFocus("list");
      } else if (key.name === "tab" && key.shift) {
        key.preventDefault();
        if (commitField === "description") setCommitField("summary");
        else setFocus("list");
      }
      return;
    }

    // 9b. Line mode owns list-mode keys while active.
    if (lineMode) {
      if (isKey(key, "escape") || isKey(key, "V")) {
        setLineModeKey(null);
      } else if (isKey(key, "j") || isKey(key, "down")) {
        moveLineCursor(1);
      } else if (isKey(key, "k") || isKey(key, "up")) {
        moveLineCursor(-1);
      } else if (isKey(key, "space")) {
        const next = new Set(lineSelectedRef.current);
        const at = lineCursorRef.current;
        if (next.has(at)) next.delete(at);
        else next.add(at);
        setLineSelected(next);
        moveLineCursor(1);
      } else if (isKey(key, "a")) {
        setLineSelected(
          lineSelectedRef.current.size === changeLines.length ? new Set() : new Set(changeLines),
        );
      } else if (isKey(key, "[")) {
        model.moveHunk(-1);
      } else if (isKey(key, "]")) {
        model.moveHunk(1);
      } else if (isKey(key, "return")) {
        // Nothing picked means "the line under the cursor", like the pickers.
        const picked = lineSelectedRef.current;
        void model.toggleLinesStage(picked.size > 0 ? picked : new Set([lineCursorRef.current]));
      }
      return;
    }

    const inHistory = statusTab === "history";

    // 10. List mode.
    if (key.name === "?" || (key.name === "/" && key.shift)) {
      setShowHelp(true);
    } else if (isKey(key, "/")) {
      setShowFilter(true);
    } else if (isKey(key, "escape")) {
      // Esc in list mode clears whichever filter this tab has.
      if (inHistory) history.setQuery("");
      else model.setFilter("");
    } else if (isKey(key, "q")) {
      renderer.destroy();
      process.exit(0);
    } else if (isKey(key, "j") || isKey(key, "down")) {
      if (inHistory) {
        if (historyFocus === "commits") history.moveCommit(1);
        else history.moveFile(1);
      } else {
        model.move(1);
      }
    } else if (isKey(key, "k") || isKey(key, "up")) {
      if (inHistory) {
        if (historyFocus === "commits") history.moveCommit(-1);
        else history.moveFile(-1);
      } else {
        model.move(-1);
      }
    } else if (isKey(key, "space") || isKey(key, "return")) {
      if (inHistory) {
        setHistoryFocus("files");
      } else if (model.selectedKey?.startsWith("dir:")) {
        model.toggleCollapsed();
      } else {
        void model.toggleStage();
      }
    } else if (isKey(key, "left") || isKey(key, "h")) {
      if (inHistory) setHistoryFocus("commits");
      else if (model.selectedKey?.startsWith("dir:")) model.setCollapsed(model.selectedKey, true);
    } else if (isKey(key, "right") || isKey(key, "l")) {
      if (inHistory) setHistoryFocus("files");
      else if (model.selectedKey?.startsWith("dir:")) model.setCollapsed(model.selectedKey, false);
    } else if (isKey(key, "a")) {
      if (!inHistory) void model.stageAll();
    } else if (isKey(key, "A")) {
      if (!inHistory) void model.unstageAll();
    } else if (isKey(key, "c")) {
      if (!inHistory) enterCommit();
    } else if (isKey(key, "C")) {
      if (!inHistory) openCoAuthorPicker();
    } else if (isKey(key, "M")) {
      if (!inHistory) void startAmend();
    } else if (isKey(key, "P")) {
      if (!inHistory) void requestPush();
    } else if (isKey(key, "F")) {
      if (!inHistory) requestForcePush();
    } else if (isKey(key, "p")) {
      if (!inHistory) void model.pull();
    } else if (isKey(key, "e")) {
      if (!inHistory) void openSelectedInEditor();
    } else if (isKey(key, "X")) {
      if (!inHistory) requestDiscard();
    } else if (isKey(key, "d")) {
      diffScrollRef.current?.scrollBy(8);
    } else if (isKey(key, "u")) {
      diffScrollRef.current?.scrollBy(-8);
    } else if (isKey(key, "[")) {
      if (!inHistory) model.moveHunk(-1);
    } else if (isKey(key, "]")) {
      if (!inHistory) model.moveHunk(1);
    } else if (isKey(key, "H")) {
      if (!inHistory) void model.toggleHunkStage();
    } else if (isKey(key, "V")) {
      if (!inHistory && changeLines.length > 0) setLineModeKey(model.selectedKey);
    } else if (isKey(key, "v")) {
      setDiffView((v) => (v === "split" ? "unified" : "split"));
    } else if (isKey(key, "n")) {
      setShowLineNumbers((s) => !s);
    } else if (isKey(key, "w")) {
      setWrapDiff((w) => !w);
    } else if (isKey(key, "r")) {
      void model.refresh();
      void history.refresh();
    } else if (isKey(key, "tab")) {
      enterCommit();
    } else if (isKey(key, "t")) {
      setStatusTab((t) => (t === "changes" ? "history" : "changes"));
      setHistoryFocus("commits");
    } else if (isKey(key, "b")) {
      openBranchPicker();
    } else if (isKey(key, "s")) {
      openStashPicker();
    } else if (isKey(key, "S")) {
      if (inHistory && historyFocus === "commits") startSquash();
    } else if (isKey(key, "R")) {
      if (inHistory && historyFocus === "commits") requestRevert();
    } else if (isKey(key, "o")) {
      void model.browse();
    } else if (isKey(key, "y")) {
      if (!inHistory) {
        copy(model.selected?.entry.path ?? model.selectedKey?.replace(/^dir:/, ""), "path");
      } else if (historyFocus === "files") {
        copy(history.selectedPath, "path");
      } else {
        copy(history.selectedSha, "commit sha");
      }
    } else if (isKey(key, "Y")) {
      if (inHistory) {
        copy(history.commits.find((c) => c.sha === history.selectedSha)?.subject, "commit subject");
      }
    } else if (isKey(key, "z")) {
      openReflogPicker();
    } else if (isKey(key, "g")) {
      if (model.repoState !== "clean") void model.continueConflict();
    } else if (isKey(key, "G")) {
      if (model.repoState !== "clean") requestAbortConflict();
    } else if (key.name === "g" && key.ctrl) {
      if (!inHistory && stagedCount > 0 && !model.generatingCommitMessage) runGenerate();
    }
  });

  if (model.error) {
    return (
      <box
        style={{
          padding: 2,
          flexDirection: "column",
          backgroundColor: theme.bg,
        }}
      >
        <text style={{ fg: theme.removed }}>Could not read repository:</text>
        <text style={{ fg: theme.fg }}>{model.error}</text>
        <text style={{ fg: theme.faint }}>Press q to quit.</text>
      </box>
    );
  }

  const selectedDirRow =
    statusTab === "history"
      ? null
      : (model.rows.find(
          (r): r is Extract<typeof r, { type: "dir" }> =>
            r.key === model.selectedKey && r.type === "dir",
        ) ?? null);

  const diffTitle =
    statusTab === "history"
      ? history.selectedPath
        ? ` ${history.selectedPath}  (${history.selectedSha?.slice(0, 7) ?? ""}) `
        : null
      : model.selected
        ? ` ${model.selected.entry.path}${model.selected.section === "staged" ? "  (staged)" : ""} `
        : null;

  return (
    <box
      style={{
        flexDirection: "column",
        width,
        height,
        backgroundColor: theme.bg,
      }}
    >
      <StatusBar
        status={model.status}
        repoPath={getGitCwd()}
        changeCount={model.entries.length}
        busy={model.busy}
        toast={model.toast}
      />
      <box style={{ flexDirection: "row", flexGrow: 1, flexShrink: 1 }}>
        {statusTab === "history" ? (
          <StatusPanelCommits
            commits={history.commits}
            loadingMore={history.loadingMore}
            selectedSha={history.selectedSha}
            focused={focus === "list" && historyFocus === "commits"}
            width={commitsWidth}
            query={history.query}
            onSelect={history.selectCommit}
          />
        ) : null}
        <StatusPanel
          activeTab={statusTab}
          rows={model.rows}
          selectedKey={model.selectedKey}
          files={history.files}
          selectedPath={history.selectedPath}
          focused={focus === "list" && (statusTab === "changes" || historyFocus === "files")}
          width={commitsWidth}
          onSelect={model.select}
          filter={model.filter}
          onSelectFile={history.selectFile}
          onActivate={(key) => {
            if (key.startsWith("dir:")) model.toggleCollapsed(key);
            else void model.toggleStage();
          }}
        />

        {selectedDirRow ? (
          <FolderDiffPanel
            ref={diffScrollRef}
            title={` ${selectedDirRow.path}/  (${selectedDirRow.fileCount} file${selectedDirRow.fileCount === 1 ? "" : "s"}) `}
            items={model.folderDiffs}
            loading={model.folderDiffsLoading}
            view={diffView}
            showLineNumbers={showLineNumbers}
            wrap={wrapDiff}
            width={diffWidth}
          />
        ) : lineMode && currentHunk && model.selected ? (
          <LineSelectPanel
            path={model.selected.entry.path}
            hunk={currentHunk}
            hunkIndex={model.selectedHunkIndex}
            hunkCount={model.hunks.length}
            cursor={lineCursor}
            selected={lineSelected}
            staged={model.selected.section === "staged"}
            width={diffWidth}
          />
        ) : (
          <DiffPanel
            ref={diffScrollRef}
            title={diffTitle}
            empty={statusTab === "history" ? history.commits.length === 0 : model.rows.length === 0}
            diff={statusTab === "history" ? history.diff : model.diff}
            loading={statusTab === "history" ? history.diffLoading : model.diffLoading}
            binarySize={statusTab === "history" ? null : model.binarySize}
            binarySizeLoading={statusTab === "history" ? false : model.binarySizeLoading}
            hunks={statusTab === "history" ? [] : model.hunks}
            selectedHunkIndex={model.selectedHunkIndex}
            view={diffView}
            showLineNumbers={showLineNumbers}
            wrap={wrapDiff}
            width={diffWidth}
          />
        )}
      </box>

      <CommitBox
        ref={commitRef}
        focused={focus === "commit"}
        field={commitField}
        amend={amend}
        squashCount={squash?.count}
        stagedCount={stagedCount}
        coAuthors={pickedCoAuthors}
        generating={model.generatingCommitMessage}
        onGenerate={runGenerate}
        onReferenceQuery={(query) => {
          setReferenceQuery(query);
          setReferenceOpen(query !== null);
          setReferenceIndex(0);
        }}
      />

      {focus === "commit" &&
      referenceOpen &&
      (referencesLoading || referenceSuggestions.length > 0) ? (
        <ReferencePicker
          references={referenceSuggestions}
          selectedIndex={referenceIndex}
          loading={referencesLoading}
        />
      ) : null}

      <HelpFooter expanded={false} />

      {model.repoState !== "clean" ? (
        <ConflictResolution
          repoState={model.repoState}
          paths={conflictEntries.map((item) => item.entry.path)}
          pendingPaths={pendingConflictEntries.map((item) => item.entry.path)}
          selectedIndex={conflictIndex}
          busy={model.busy !== null}
          notice={model.toast?.kind === "err" ? model.toast.text : undefined}
        />
      ) : null}

      {showHelp ? (
        <box
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: theme.bg,
            zIndex: 50,
          }}
        >
          <box style={{ width: HELP_MODAL_WIDTH }}>
            <HelpFooter expanded />
          </box>
        </box>
      ) : null}

      {confirm ? <Confirm request={confirm} /> : null}
      {showBranches ? (
        <BranchPicker
          branches={model.branches}
          selectedIndex={branchIndex}
          terminalHeight={height}
        />
      ) : null}
      {showNewBranch ? (
        <TextPrompt
          ref={newBranchRef}
          title="New branch"
          placeholder="branch name"
          hint="Enter create · Esc cancel"
        />
      ) : null}
      {showFilter ? (
        <TextPrompt
          ref={filterRef}
          title={statusTab === "history" ? "Search commits" : "Filter files"}
          placeholder={statusTab === "history" ? "message text or sha" : "path contains…"}
          hint="Enter apply (empty clears) · Esc cancel"
          initialValue={statusTab === "history" ? history.query : model.filter}
        />
      ) : null}
      {cherryPick ? (
        <CherryPickPicker
          branch={cherryPick.branch}
          commits={cherryPick.commits}
          selectedIndex={cherryIndex}
          checked={cherryChecked}
          terminalHeight={height}
        />
      ) : null}
      {showStash ? (
        <StashPicker
          stashes={model.stashes}
          selectedIndex={stashIndex}
          canStash={model.entries.length > 0}
        />
      ) : null}
      {showCoAuthors ? (
        <CoAuthorPicker
          contributors={model.contributors}
          selectedIndex={coAuthorIndex}
          checked={coAuthors}
        />
      ) : null}
      {showReflog ? <ReflogPicker entries={model.reflog} selectedIndex={reflogIndex} /> : null}
    </box>
  );
}

import type { KeyEvent } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getGitCwd, lastCommitMessage } from "../git/index.js";
import { useCommitHistory } from "../state/history.js";
import { useRepoModel } from "../state/model.js";
import { useRepoWatch } from "../state/watch.js";
import { CommitBox, type CommitBoxHandle } from "./commit-box.js";
import { Confirm, type ConfirmRequest } from "./confirm.js";
import { DiffPanel, type DiffScrollHandle } from "./diff-panel.js";
import { HelpFooter } from "./help-footer.js";
import { firstHunkLine, openInEditor } from "./open-editor.js";
import { StatusBar } from "./status-bar.js";
import { StatusPanelCommits } from "./status-panel/commits.js";
import { StatusPanel, type StatusTab } from "./status-panel/index.js";
import { theme } from "./theme.js";

export type Focus = "list" | "commit";
/** Which of the two history-mode panes (commit list vs. its files) has j/k. */
type HistoryFocus = "commits" | "files";

/** Match a KeyEvent against a target like "a", "A" (shift+a), "space", "escape". */
function isKey(key: KeyEvent, target: string): boolean {
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
  const [showHelp, setShowHelp] = useState(false);
  const [diffView, setDiffView] = useState<"split" | "unified">("split");
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrapDiff, setWrapDiff] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const commitRef = useRef<CommitBoxHandle>(null);
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

  const enterCommit = useCallback(() => {
    setFocus("commit");
  }, []);

  const cancelCommit = useCallback(() => {
    setFocus("list");
    setAmend(false);
    commitRef.current?.clear();
  }, []);

  const doCommit = useCallback(async () => {
    const message = commitRef.current?.getText() ?? "";
    if (!message.trim() && !amend) {
      model.setToast({ kind: "err", text: "Write a commit message first" });
      return;
    }
    const outcome = await model.commit(message, amend);
    if (outcome.ok) {
      commitRef.current?.clear();
      setAmend(false);
      setFocus("list");
    }
  }, [amend, model]);

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
    setFocus("commit");
  }, []);

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

    // 2. Help overlay.
    if (showHelp) {
      if (isKey(key, "escape") || key.name === "?" || (key.name === "/" && key.shift)) {
        setShowHelp(false);
      }
      return;
    }

    // 3. Commit editor mode — let the textarea have the keys, only intercept a few.
    if (focus === "commit") {
      if (isKey(key, "escape")) {
        cancelCommit();
      } else if (key.name === "s" && key.ctrl) {
        requestCommit();
      } else if (isKey(key, "tab")) {
        setFocus("list");
      }
      return;
    }

    const inHistory = statusTab === "history";

    // 4. List mode.
    if (key.name === "?" || (key.name === "/" && key.shift)) {
      setShowHelp(true);
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
    } else if (key.name === "s" && key.ctrl) {
      if (!inHistory) requestCommit();
    } else if (isKey(key, "M")) {
      if (!inHistory) void startAmend();
    } else if (isKey(key, "P")) {
      if (!inHistory) void model.push();
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
      setFocus("commit");
    } else if (isKey(key, "t")) {
      setStatusTab((t) => (t === "changes" ? "history" : "changes"));
      setHistoryFocus("commits");
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
      />

      <box style={{ flexDirection: "row", flexGrow: 1, flexShrink: 1 }}>
        {statusTab === "history" ? (
          <StatusPanelCommits
            commits={history.commits}
            selectedSha={history.selectedSha}
            focused={focus === "list" && historyFocus === "commits"}
            width={commitsWidth}
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
          onSelectFile={history.selectFile}
          onActivate={(key) => {
            if (key.startsWith("dir:")) model.toggleCollapsed(key);
            else void model.toggleStage();
          }}
        />
        <DiffPanel
          ref={diffScrollRef}
          title={diffTitle}
          diff={statusTab === "history" ? history.diff : model.diff}
          loading={statusTab === "history" ? history.diffLoading : model.diffLoading}
          view={diffView}
          showLineNumbers={showLineNumbers}
          wrap={wrapDiff}
          width={diffWidth}
        />
      </box>

      <CommitBox
        ref={commitRef}
        focused={focus === "commit"}
        amend={amend}
        stagedCount={stagedCount}
      />

      {model.toast ? (
        <box style={{ height: 1, paddingLeft: 1 }}>
          <text
            style={{
              fg:
                model.toast.kind === "ok"
                  ? theme.toastOk
                  : model.toast.kind === "err"
                    ? theme.toastErr
                    : theme.dim,
            }}
          >
            {model.toast.text}
          </text>
        </box>
      ) : null}

      <HelpFooter expanded={false} />

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
          <box style={{ width: 40 }}>
            <HelpFooter expanded />
          </box>
        </box>
      ) : null}

      {confirm ? <Confirm request={confirm} /> : null}
    </box>
  );
}

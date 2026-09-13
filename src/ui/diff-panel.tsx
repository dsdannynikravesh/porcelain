import type { DiffRenderable } from "@opentui/core";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { FileDiff } from "../git/index.js";
import { syntaxStyle } from "./syntax.js";
import { theme } from "./theme.js";

export interface DiffScrollHandle {
  scrollBy: (delta: number) => void;
  scrollToTop: () => void;
}

interface Props {
  /** Title for the box — a working-tree file path or a commit's file path.
   *  Null means nothing is selected. Callers build the exact text (e.g. the
   *  " (staged)" suffix, or a short sha) since that's source-specific. */
  title: string | null;
  diff: FileDiff | null;
  loading: boolean;
  view: "split" | "unified";
  showLineNumbers: boolean;
  wrap: boolean;
  width: number;
}

interface Scrollable {
  scrollY: number;
  maxScrollY: number;
}

function collectScrollables(node: unknown, out: Scrollable[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown> & { getChildren?: () => unknown[] };
  if (typeof n.maxScrollY === "number" && typeof n.scrollY === "number") {
    out.push(n as unknown as Scrollable);
  }
  const kids = typeof n.getChildren === "function" ? n.getChildren() : [];
  for (const k of kids) collectScrollables(k, out);
}

function Message({ children }: { children: string }) {
  return (
    <box style={{ padding: 1 }}>
      <text style={{ fg: theme.faint }}>{children}</text>
    </box>
  );
}

export const DiffPanel = forwardRef<DiffScrollHandle, Props>(function DiffPanel(
  { title, diff, loading, view, showLineNumbers, wrap, width },
  ref,
) {
  const diffRef = useRef<DiffRenderable | null>(null);

  const applyScroll = (fn: (s: Scrollable) => number) => {
    const nodes: Scrollable[] = [];
    collectScrollables(diffRef.current, nodes);
    for (const node of nodes) {
      node.scrollY = Math.max(0, Math.min(fn(node), node.maxScrollY));
    }
  };

  useImperativeHandle(ref, () => ({
    scrollBy: (delta) => applyScroll((s) => s.scrollY + delta),
    scrollToTop: () => applyScroll(() => 0),
  }));

  // Reset scroll to top whenever the shown file changes.
  useEffect(() => {
    applyScroll(() => 0);
  }, [title, diff?.patch]);

  const boxTitle = title ?? " Diff ";

  let body: React.ReactNode;
  if (!title) {
    body = <Message>Select a file to see its diff.</Message>;
  } else if (loading && !diff) {
    body = <Message>Loading diff…</Message>;
  } else if (diff?.binary) {
    body = <Message>Binary file — no textual diff.</Message>;
  } else if (diff?.truncated) {
    body = <Message>Diff too large to display (over 400 KB).</Message>;
  } else if (!diff || diff.patch.trim() === "") {
    const reason =
      diff?.emptyReason === "new-empty-file"
        ? "New empty file — nothing to diff yet."
        : diff?.emptyReason === "mode-only"
          ? "File mode changed — no content difference."
          : diff?.emptyReason === "no-content-change"
            ? "No content difference (rename or metadata only)."
            : "No changes to show for this file.";
    body = <Message>{reason}</Message>;
  } else {
    body = (
      <diff
        ref={diffRef}
        diff={diff.patch}
        view={view}
        syncScroll
        showLineNumbers={showLineNumbers}
        filetype={diff.filetype}
        syntaxStyle={syntaxStyle}
        wrapMode={wrap ? "word" : "none"}
        addedBg={theme.diffAddedBg}
        removedBg={theme.diffRemovedBg}
        contextBg={theme.diffContextBg}
        style={{ flexGrow: 1, flexShrink: 1 }}
      />
    );
  }

  return (
    <box
      title={boxTitle}
      titleColor="white"
      style={{
        border: true,
        borderColor: theme.dim,
        flexDirection: "column",
        width,
        flexGrow: 1,
        flexShrink: 1,
      }}
    >
      {body}
    </box>
  );
});

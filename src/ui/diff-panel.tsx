import type { DiffRenderable } from "@opentui/core";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { FileDiff, Hunk } from "../git/index.js";
import { syntaxStyle } from "./syntax.js";
import { BOLD, theme } from "./theme.js";

export interface DiffScrollHandle {
  scrollBy: (delta: number) => void;
  scrollToTop: () => void;
}

interface Props {
  /** Title for the box — a working-tree file path or a commit's file path.
   *  Null means nothing is selected. Callers build the exact text (e.g. the
   *  " (staged)" suffix, or a short sha) since that's source-specific. */
  title: string | null;
  /** True when the list next to this panel has nothing in it at all (a
   *  clean tree, or no commits) — distinct from "has items, none picked". */
  empty: boolean;
  diff: FileDiff | null;
  loading: boolean;
  /** Hunks of `diff`, for the hunk-staging affordance — [] disables it entirely. */
  hunks: Hunk[];
  selectedHunkIndex: number;
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
  { title, empty, diff, loading, hunks, selectedHunkIndex, view, showLineNumbers, wrap, width },
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

  // Mark which hunk `H` will stage/unstage: a soft background over its rows,
  // and scroll it into view so navigating hunks with `[`/`]` doesn't require
  // separately scrolling the diff to find where you ended up.
  useEffect(() => {
    const node = diffRef.current;
    if (!node) return;
    node.clearAllLineColors();
    const hunk = hunks[selectedHunkIndex];
    if (!hunk) return;
    const offsets = node.getHunkRowOffsets();
    const start = offsets[selectedHunkIndex];
    if (start === undefined) return;
    // Bounded by the hunk's own (finite) line count — never an open-ended
    // scan — so this can't turn into a runaway loop even if wrapping makes
    // the real rendered span longer or shorter than this estimate.
    const end = offsets[selectedHunkIndex + 1] ?? start + hunk.lines.length;
    node.highlightLines(start, Math.max(start, end - 1), theme.selectionBgMuted);
    applyScroll(() => start);
  }, [hunks, selectedHunkIndex]);

  const hunkSuffix = hunks.length > 1 ? `  ·  hunk ${selectedHunkIndex + 1}/${hunks.length}` : "";
  const boxTitle = title ? `${title}${hunkSuffix}` : " Diff ";

  let body: React.ReactNode;
  if (!title && empty) {
    // Literally nothing to show — a quiet dashboard state, centered like the
    // rest of this app's overlays, rather than pinned to the top-left corner.
    body = (
      <box style={{ flexGrow: 1, flexShrink: 1, justifyContent: "center", alignItems: "center" }}>
        <box style={{ flexDirection: "column", alignItems: "center", gap: 1 }}>
          <text style={{ fg: theme.dim, attributes: BOLD }}>Nothing to show</text>
          <box style={{ flexDirection: "row", marginTop: 1 }}>
            <text style={{ fg: theme.accent, attributes: BOLD }}>o</text>
            <text style={{ fg: theme.faint }}>{"  open this repo on GitHub"}</text>
          </box>
        </box>
      </box>
    );
  } else if (!title) {
    // Items exist, just nothing picked yet — a different message from the
    // empty-tree case above, but centered the same way.
    body = (
      <box style={{ flexGrow: 1, flexShrink: 1, justifyContent: "center", alignItems: "center" }}>
        <text style={{ fg: theme.faint }}>Select a file to see its diff</text>
      </box>
    );
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

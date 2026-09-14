import type { DiffRenderable } from "@opentui/core";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { BinarySizeSides, FileDiff, Hunk } from "../git/index.js";
import { syntaxStyle } from "./syntax.js";
import { BOLD, theme } from "./theme.js";

/** "849.7 KB", "12 B", … — used for binary diffs, which have no line counts
 *  to show instead. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

/** "12.3 KB → 45.6 KB", "new file, 849.7 KB", "deleted, was 12.3 KB" — null
 *  when sizes aren't known (yet, or neither side exists). */
function sizeChangeLabel(sizes: BinarySizeSides | null): string | null {
  if (!sizes) return null;
  const { before, after } = sizes;
  if (before == null && after != null) return `new file, ${formatBytes(after)}`;
  if (before != null && after == null) return `deleted, was ${formatBytes(before)}`;
  if (before != null && after != null) {
    return before === after ? formatBytes(after) : `${formatBytes(before)} → ${formatBytes(after)}`;
  }
  return null;
}

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
  /** Before/after byte sizes whenever `diff` is binary. */
  binarySize: BinarySizeSides | null;
  binarySizeLoading: boolean;
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

/** The binary-diff message — no picture, just what changed size-wise, since
 *  that's all there is to say about it. */
function BinaryMessage({ sizes, loading }: { sizes: BinarySizeSides | null; loading: boolean }) {
  const sizeLabel = sizeChangeLabel(sizes);
  const suffix = sizeLabel ? ` (${sizeLabel})` : loading ? " (measuring size…)" : "";
  return <Message>{`Binary file — no textual diff.${suffix}`}</Message>;
}

interface FileDiffBodyProps {
  diff: FileDiff;
  view: "split" | "unified";
  showLineNumbers: boolean;
  wrap: boolean;
  /** True to fill the parent (the single-file view); false to size to its own
   *  content height (stacked alongside others in the folder view). */
  fill?: boolean;
}

/** The binary/truncated/empty/normal-diff body for one file's `FileDiff` —
 *  shared between the single-file view here and the folder stack view, so
 *  the same guards apply to a file however it's reached. */
export function FileDiffBody({ diff, view, showLineNumbers, wrap, fill }: FileDiffBodyProps) {
  if (diff.binary) return <Message>Binary file — no textual diff.</Message>;
  if (diff.truncated) return <Message>Diff too large to display (over 400 KB).</Message>;
  if (diff.patch.trim() === "") {
    const reason =
      diff.emptyReason === "new-empty-file"
        ? "New empty file — nothing to diff yet."
        : diff.emptyReason === "mode-only"
          ? "File mode changed — no content difference."
          : diff.emptyReason === "no-content-change"
            ? "No content difference (rename or metadata only)."
            : "No changes to show for this file.";
    return <Message>{reason}</Message>;
  }
  return (
    <diff
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
      style={fill ? { flexGrow: 1, flexShrink: 1 } : undefined}
    />
  );
}

export const DiffPanel = forwardRef<DiffScrollHandle, Props>(function DiffPanel(
  {
    title,
    empty,
    diff,
    loading,
    binarySize,
    binarySizeLoading,
    hunks,
    selectedHunkIndex,
    view,
    showLineNumbers,
    wrap,
    width,
  },
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

  // Scroll the selected hunk (`H` will stage/unstage it) into view, so
  // navigating with `[`/`]` doesn't require separately scrolling to find
  // where you ended up. NOTE: deliberately doesn't also paint a highlight
  // over its rows — `highlightLines`/`clearAllLineColors` share the exact
  // same underlying color map the diff's own added/removed backgrounds are
  // stored in, so touching it here on every selection change was clobbering
  // (and not restoring) the real diff colors. The "hunk i/N" title suffix
  // below is the selection indicator instead.
  useEffect(() => {
    const node = diffRef.current;
    if (!node) return;
    const hunk = hunks[selectedHunkIndex];
    if (!hunk) return;
    const offsets = node.getHunkRowOffsets();
    const start = offsets[selectedHunkIndex];
    if (start === undefined) return;
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
    body = <BinaryMessage sizes={binarySize} loading={binarySizeLoading} />;
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

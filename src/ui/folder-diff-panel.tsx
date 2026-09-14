import type { ScrollBoxRenderable } from "@opentui/core";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { FolderDiffItem } from "../state/model.js";
import { type DiffScrollHandle, FileDiffBody } from "./diff-panel.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  /** Same box-title contract as `DiffPanel` — pre-built by the caller. */
  title: string;
  items: FolderDiffItem[];
  loading: boolean;
  view: "split" | "unified";
  showLineNumbers: boolean;
  wrap: boolean;
  width: number;
}

/**
 * The folder-selected counterpart to `DiffPanel`'s single-file view: every
 * changed file under the selected directory, stacked top to bottom in one
 * scrollable region — lazygit's folder-diff behavior. Hunk staging (`H`,
 * `[`/`]`) stays single-file-only; this view is read-only navigation.
 */
export const FolderDiffPanel = forwardRef<DiffScrollHandle, Props>(function FolderDiffPanel(
  { title, items, loading, view, showLineNumbers, wrap, width },
  ref,
) {
  const boxRef = useRef<ScrollBoxRenderable | null>(null);

  useImperativeHandle(ref, () => ({
    scrollBy: (delta) => {
      const node = boxRef.current;
      if (!node) return;
      node.scrollTop = Math.max(0, Math.min(node.scrollTop + delta, node.scrollHeight));
    },
    scrollToTop: () => {
      if (boxRef.current) boxRef.current.scrollTop = 0;
    },
  }));

  return (
    <box
      title={title}
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
      {items.length === 0 ? (
        <box style={{ flexGrow: 1, flexShrink: 1, justifyContent: "center", alignItems: "center" }}>
          <text style={{ fg: theme.faint }}>
            {loading ? "Loading diffs…" : "No changes in this folder."}
          </text>
        </box>
      ) : (
        <scrollbox
          ref={boxRef}
          style={{ flexGrow: 1, flexShrink: 1, rootOptions: { backgroundColor: theme.bg } }}
        >
          {items.map((item) => (
            <box key={item.key} style={{ flexDirection: "column" }}>
              <box
                style={{
                  flexDirection: "row",
                  height: 1,
                  backgroundColor: theme.border,
                  paddingLeft: 1,
                  paddingRight: 1,
                }}
              >
                <text style={{ fg: theme.headerFg, attributes: BOLD }}>{item.path}</text>
                {item.staged ? <text style={{ fg: theme.added }}>{"  (staged)"}</text> : null}
              </box>
              <FileDiffBody
                diff={item.diff}
                view={view}
                showLineNumbers={showLineNumbers}
                wrap={wrap}
              />
            </box>
          ))}
        </scrollbox>
      )}
    </box>
  );
});

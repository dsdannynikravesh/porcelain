// The middle pane's body in history mode: a flat list of the files changed
// by the selected commit (no staged/unstaged distinction — that's a
// working-tree concept that doesn't apply here). Reuses the same kind
// badge/color conventions as changes.tsx's file rows.

import type { ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import type { CommitFileEntry } from "../../git/index.js";
import { ensureRowVisible } from "../scroll.js";
import { BOLD, kindBadge, kindColor, theme } from "../theme.js";

// Matches RowView's box `height: 1` below.
const ROW_HEIGHT = 1;

interface Props {
  files: CommitFileEntry[];
  selectedPath: string | null;
  focused: boolean;
  width: number;
  onSelect?: (path: string) => void;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…${text.slice(-Math.max(1, max - 1))}`;
}

function RowView({
  file,
  selected,
  focused,
  width,
  onSelect,
}: {
  file: CommitFileEntry;
  selected: boolean;
  focused: boolean;
  width: number;
  onSelect?: (path: string) => void;
}) {
  // Blue only where j/k actually act right now; a muted gray still marks the
  // row elsewhere so the selection doesn't just disappear when focus moves.
  const fg = selected && focused ? theme.selectionFg : undefined;
  const bg = selected ? (focused ? theme.selectionBg : theme.selectionBgMuted) : undefined;
  const avail = Math.max(4, width - 1 - 3);

  return (
    <box
      id={`file-${file.path}`}
      onMouseDown={(e) => {
        if (e.button === 0) onSelect?.(file.path);
      }}
      style={{
        flexDirection: "row",
        height: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: bg,
      }}
    >
      <text
        style={{ fg: fg ?? kindColor(file.kind), attributes: BOLD }}
      >{`${kindBadge(file.kind)} `}</text>
      <text style={{ fg: fg ?? theme.fg }}>{truncate(file.path, avail)}</text>
    </box>
  );
}

export function CommittedFiles({ files, selectedPath, focused, width, onSelect }: Props) {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);

  useEffect(() => {
    if (!selectedPath) return;
    const idx = files.findIndex((f) => f.path === selectedPath);
    ensureRowVisible(scrollboxRef.current, idx, ROW_HEIGHT);
  }, [selectedPath, files]);

  if (files.length === 0) {
    // Centered like the diff panel's own "Nothing to show" — a quiet
    // dashboard state, not a message pinned to the top-left corner.
    return (
      <box style={{ flexGrow: 1, flexShrink: 1, justifyContent: "center", alignItems: "center" }}>
        <text style={{ fg: theme.faint }}>No files in this commit.</text>
      </box>
    );
  }

  return (
    <scrollbox
      ref={scrollboxRef}
      // See changes.tsx: app-level key handling owns j/k, not the scrollbox.
      focused={false}
      style={{ flexGrow: 1, rootOptions: { backgroundColor: theme.panelBg } }}
    >
      {files.map((f) => (
        <RowView
          key={f.path}
          file={f}
          selected={f.path === selectedPath}
          focused={focused}
          width={width - 2}
          onSelect={onSelect}
        />
      ))}
    </scrollbox>
  );
}

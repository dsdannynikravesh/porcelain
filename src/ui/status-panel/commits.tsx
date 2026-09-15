// The leftmost pane in history mode — a flat, linear list of commits (no
// tree/dir nesting the way changes.tsx has, since commit history has none).
// Selecting a commit here drives what status-panel/index.tsx's "Files" list
// and the DiffPanel show next to it.

import type { ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import type { CommitEntry } from "../../git/index.js";
import { BOLD, theme } from "../theme.js";

interface Props {
  commits: CommitEntry[];
  loadingMore: boolean;
  selectedSha: string | null;
  focused: boolean;
  width: number;
  onSelect?: (sha: string) => void;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

function CommitRowView({
  commit,
  selected,
  focused,
  width,
  onSelect,
}: {
  commit: CommitEntry;
  selected: boolean;
  focused: boolean;
  width: number;
  onSelect?: (sha: string) => void;
}) {
  // Blue only where j/k actually act right now; a muted gray still marks the
  // row elsewhere so the selection doesn't just disappear when focus moves.
  const fg = selected && focused ? theme.selectionFg : undefined;
  const bg = selected ? (focused ? theme.selectionBg : theme.selectionBgMuted) : undefined;
  const separator = " · ";
  const avail = Math.max(4, width - 1 - commit.shortSha.length - separator.length - 2);

  return (
    <box
      id={`commit-${commit.sha}`}
      onMouseDown={(e) => {
        if (e.button === 0) onSelect?.(commit.sha);
      }}
      style={{
        flexDirection: "column",
        height: 2,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: bg,
      }}
    >
      <box style={{ flexDirection: "row", height: 1 }}>
        <text style={{ fg: fg ?? theme.accent, attributes: BOLD }}>{commit.shortSha}</text>
        <text style={{ fg: fg ?? theme.dim }}>{separator}</text>
        <text style={{ fg: fg ?? theme.fg }}>{truncate(commit.subject, avail)}</text>
      </box>
      <text
        style={{ fg: fg ?? theme.faint }}
      >{`${commit.author || "Unknown author"}${commit.date ? `  ·  ${commit.date}` : ""}`}</text>
    </box>
  );
}

export function StatusPanelCommits({
  commits,
  loadingMore,
  selectedSha,
  focused,
  width,
  onSelect,
}: Props) {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);

  useEffect(() => {
    if (selectedSha) scrollboxRef.current?.scrollChildIntoView(`commit-${selectedSha}`);
  }, [selectedSha]);

  return (
    <box
      title=" History "
      style={{
        border: true,
        borderColor: focused ? theme.borderActive : theme.border,
        flexDirection: "column",
        width,
        flexGrow: 1,
        flexShrink: 0,
      }}
    >
      <box style={{ flexDirection: "row", height: 1, paddingLeft: 1 }}>
        <text style={{ fg: theme.dim, attributes: BOLD }}>COMMITS</text>
        <text style={{ fg: theme.faint }}>
          {loadingMore ? `  ${commits.length}…` : `  ${commits.length}`}
        </text>
      </box>
      <scrollbox
        ref={scrollboxRef}
        // App-level keyboard handling owns j/k and arrows. A focused OpenTUI
        // scrollbox would also consume those keys and scroll by a viewport
        // fraction, making the list jump while selection moves one row.
        focused={false}
        style={{ flexGrow: 1, rootOptions: { backgroundColor: theme.panelBg } }}
      >
        {commits.length === 0 ? (
          <box style={{ padding: 1 }}>
            <text style={{ fg: theme.faint }}>No commits yet.</text>
          </box>
        ) : null}

        {commits.map((c) => (
          <CommitRowView
            key={c.sha}
            commit={c}
            selected={c.sha === selectedSha}
            focused={focused}
            width={width - 2}
            onSelect={onSelect}
          />
        ))}
      </scrollbox>
    </box>
  );
}

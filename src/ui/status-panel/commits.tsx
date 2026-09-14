// The leftmost pane in history mode — a flat, linear list of commits (no
// tree/dir nesting the way changes.tsx has, since commit history has none).
// Selecting a commit here drives what status-panel/index.tsx's "Files" list
// and the DiffPanel show next to it.

import type { CommitEntry } from "../../git/index.js";
import { BOLD, theme } from "../theme.js";

interface Props {
  commits: CommitEntry[];
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
  const avail = Math.max(4, width - 1 - commit.shortSha.length - 2);

  return (
    <box
      onMouseDown={(e) => {
        if (e.button === 0) onSelect?.(commit.sha);
      }}
      style={{
        flexDirection: "row",
        height: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: bg,
      }}
    >
      <text style={{ fg: fg ?? theme.accent, attributes: BOLD }}>{`${commit.shortSha} `}</text>
      <text style={{ fg: fg ?? theme.fg }}>{truncate(commit.subject, avail)}</text>
    </box>
  );
}

export function StatusPanelCommits({ commits, selectedSha, focused, width, onSelect }: Props) {
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
        <text style={{ fg: theme.faint }}>{`  ${commits.length}`}</text>
      </box>

      <scrollbox
        focused={focused}
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

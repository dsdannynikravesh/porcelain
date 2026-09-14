// Renders `model.rows` — the visible rows of a collapsible folder tree built
// from the flat change list in state/tree.ts. Directory rows carry a
// `dir:<path>` key; file rows carry the SelectableEntry key.

import type { TreeRow } from "../../state/tree.js";
import { BOLD, kindBadge, kindColor, theme } from "../theme.js";

interface Props {
  rows: TreeRow[];
  selectedKey: string | null;
  focused: boolean;
  width: number;
  onSelect?: (key: string) => void;
  onActivate?: (key: string) => void;
}

const INDENT = 2;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `…${text.slice(-Math.max(1, max - 1))}`;
}

function RowView({
  row,
  selected,
  focused,
  width,
  onSelect,
  onActivate,
  pairedStaged,
}: {
  row: TreeRow;
  selected: boolean;
  focused: boolean;
  width: number;
  onSelect?: (key: string) => void;
  onActivate?: (key: string) => void;
  /** True when this is the staged half of a partially-staged file, i.e. the
   *  row directly above is the same path's unstaged half — the pair is drawn
   *  as one entry instead of repeating the filename twice in a row. */
  pairedStaged?: boolean;
}) {
  const pad = 1 + row.depth * INDENT;
  const avail = Math.max(4, width - pad - 3);
  // Blue only where j/k actually act right now; a muted gray still marks the
  // row elsewhere so the selection doesn't just disappear when focus moves.
  const fg = selected && focused ? theme.selectionFg : undefined;
  const bg = selected ? (focused ? theme.selectionBg : theme.selectionBgMuted) : undefined;

  return (
    <box
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if (selected) onActivate?.(row.key);
        else onSelect?.(row.key);
      }}
      style={{
        flexDirection: "row",
        height: 1,
        paddingLeft: pad,
        paddingRight: 1,
        backgroundColor: bg,
      }}
    >
      {row.type === "dir" ? (
        <>
          <text style={{ fg: fg ?? theme.dim }}>{row.collapsed ? "▸ " : "▾ "}</text>
          <text style={{ fg: fg ?? theme.fg, attributes: BOLD }}>{truncate(row.name, avail)}</text>
        </>
      ) : pairedStaged ? (
        <>
          <text style={{ fg: fg ?? theme.faint }}>{"  ↳ "}</text>
          <text style={{ fg: fg ?? theme.added }}>staged ●</text>
        </>
      ) : (
        <>
          <text
            style={{
              fg: fg ?? kindColor(row.entry.entry.kind),
              attributes: BOLD,
            }}
          >
            {`${kindBadge(row.entry.entry.kind)} `}
          </text>
          <text style={{ fg: fg ?? theme.fg }}>{truncate(row.name, avail)}</text>
          {row.entry.section === "staged" ? (
            <text style={{ fg: fg ?? theme.added }}> ●</text>
          ) : null}
        </>
      )}
    </box>
  );
}

export function StatusPanelChanges({
  rows,
  selectedKey,
  focused,
  width,
  onSelect,
  onActivate,
}: Props) {
  if (rows.length === 0) {
    // Centered like the diff panel's own "Nothing to show" — a quiet
    // dashboard state, not a message pinned to the top-left corner.
    return (
      <box style={{ flexGrow: 1, flexShrink: 1, justifyContent: "center", alignItems: "center" }}>
        <text style={{ fg: theme.faint }}>Nothing to commit — working tree clean.</text>
      </box>
    );
  }

  return (
    <scrollbox
      focused={focused}
      style={{ flexGrow: 1, rootOptions: { backgroundColor: theme.panelBg } }}
    >
      {rows.map((row, i) => {
        const prev = rows[i - 1];
        const pairedStaged =
          row.type === "file" &&
          row.entry.section === "staged" &&
          prev?.type === "file" &&
          prev.entry.entry.path === row.entry.entry.path;
        return (
          <RowView
            key={row.key}
            row={row}
            selected={row.key === selectedKey}
            focused={focused}
            width={width - 2}
            onSelect={onSelect}
            onActivate={onActivate}
            pairedStaged={pairedStaged}
          />
        );
      })}
    </scrollbox>
  );
}

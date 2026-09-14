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
}: {
  row: TreeRow;
  selected: boolean;
  focused: boolean;
  width: number;
  onSelect?: (key: string) => void;
  onActivate?: (key: string) => void;
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
  return (
    <scrollbox
      focused={focused}
      style={{ flexGrow: 1, rootOptions: { backgroundColor: theme.panelBg } }}
    >
      {rows.length === 0 ? (
        <box style={{ padding: 1 }}>
          <text style={{ fg: theme.faint }}>Nothing to commit — working tree clean.</text>
        </box>
      ) : null}

      {rows.map((row) => (
        <RowView
          key={row.key}
          row={row}
          selected={row.key === selectedKey}
          focused={focused}
          width={width - 2}
          onSelect={onSelect}
          onActivate={onActivate}
        />
      ))}
    </scrollbox>
  );
}

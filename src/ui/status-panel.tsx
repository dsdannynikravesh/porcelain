import { theme, kindBadge, kindColor, BOLD } from "./theme.js";
import type { TreeRow } from "../state/tree.js";

// The status panel renders `model.rows` — the visible rows of a collapsible
// folder tree built from the flat change list in state/tree.ts. Directory rows
// carry a `dir:<path>` key; file rows carry the SelectableEntry key.

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
  return `…${text.slice(-(Math.max(1, max - 1)))}`;
}

function RowView({
  row,
  selected,
  width,
  onSelect,
  onActivate,
}: {
  row: TreeRow;
  selected: boolean;
  width: number;
  onSelect?: (key: string) => void;
  onActivate?: (key: string) => void;
}) {
  const pad = 1 + row.depth * INDENT;
  const avail = Math.max(4, width - pad - 3);
  const fg = selected ? theme.selectionFg : undefined;

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
        backgroundColor: selected ? theme.selectionBg : undefined,
      }}
    >
      {row.type === "dir" ? (
        <>
          <text style={{ fg: fg ?? theme.dim }}>{row.collapsed ? "▸ " : "▾ "}</text>
          <text style={{ fg: fg ?? theme.fg, attributes: BOLD }}>
            {truncate(row.name, avail)}
          </text>
          <text style={{ fg: fg ?? theme.faint }}>{`  ${row.fileCount}`}</text>
        </>
      ) : (
        <>
          <text style={{ fg: fg ?? kindColor(row.entry.entry.kind), attributes: BOLD }}>
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

export function StatusPanel({
  rows,
  selectedKey,
  focused,
  width,
  onSelect,
  onActivate,
}: Props) {
  const fileCount = rows.reduce((n, r) => n + (r.type === "file" ? 1 : 0), 0);

  return (
    <box
      title=" Changes "
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
        <text style={{ fg: theme.dim, attributes: BOLD }}>CHANGES</text>
        <text style={{ fg: theme.faint }}>{`  ${fileCount}`}</text>
      </box>

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
            width={width - 2}
            onSelect={onSelect}
            onActivate={onActivate}
          />
        ))}
      </scrollbox>
    </box>
  );
}

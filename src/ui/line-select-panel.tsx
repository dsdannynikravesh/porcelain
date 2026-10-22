import type { ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useMemo, useRef } from "react";
import type { Hunk } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  /** The file path, as the diff panel would title it. */
  path: string;
  hunk: Hunk;
  hunkIndex: number;
  hunkCount: number;
  /** Index into `hunk.lines` of the cursor row — always a change line. */
  cursor: number;
  selected: ReadonlySet<number>;
  /** True when this is the staged diff (Enter unstages instead of stages). */
  staged: boolean;
  width: number;
}

interface Row {
  index: number;
  sign: string;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

const HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Body lines with their old/new line numbers, walked from the hunk header. */
function toRows(hunk: Hunk): Row[] {
  const m = HEADER_RE.exec(hunk.header);
  let oldNo = m ? Number(m[1]) : 0;
  let newNo = m ? Number(m[2]) : 0;
  const rows: Row[] = [];
  hunk.lines.forEach((line, index) => {
    // The trailing "" from splitting on "\n", and "\ No newline" markers,
    // aren't lines of the file — nothing to show or pick.
    if (line === "" || line.startsWith("\\")) return;
    const sign = line[0] ?? " ";
    const text = line.slice(1);
    if (sign === "+") rows.push({ index, sign, text, oldNo: null, newNo: newNo++ });
    else if (sign === "-") rows.push({ index, sign, text, oldNo: oldNo++, newNo: null });
    else rows.push({ index, sign, text, oldNo: oldNo++, newNo: newNo++ });
  });
  return rows;
}

/**
 * Line-mode stand-in for the diff panel: the selected hunk as plain rows,
 * one per line, with a cursor and a checkbox on every +/- line. Drawn by hand
 * rather than through `<diff>` because that renderable can't paint a per-line
 * selection without clobbering its own added/removed colors (see the note in
 * diff-panel.tsx).
 */
export function LineSelectPanel({
  path,
  hunk,
  hunkIndex,
  hunkCount,
  cursor,
  selected,
  staged,
  width,
}: Props) {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);
  const rows = useMemo(() => toRows(hunk), [hunk]);
  const numWidth = Math.max(
    3,
    ...rows.map((r) => String(Math.max(r.oldNo ?? 0, r.newNo ?? 0)).length),
  );
  // Border (2) + the "› [x] " prefix (6) + two number columns + their gaps.
  const textWidth = Math.max(8, width - 2 - 6 - numWidth * 2 - 3);

  useEffect(() => {
    scrollboxRef.current?.scrollChildIntoView(`line-${cursor}`);
  }, [cursor]);

  const hunkLabel = hunkCount > 1 ? `  ·  hunk ${hunkIndex + 1}/${hunkCount}` : "";
  const title = ` ${path}${staged ? "  (staged)" : ""}  ·  lines${hunkLabel}  ·  ${selected.size} selected `;
  const num = (n: number | null) => (n === null ? "" : String(n)).padStart(numWidth);

  return (
    <box
      title={title}
      titleColor="white"
      style={{
        border: true,
        borderColor: theme.borderActive,
        flexDirection: "column",
        width,
        flexGrow: 1,
        flexShrink: 1,
      }}
    >
      <scrollbox ref={scrollboxRef} style={{ flexGrow: 1, flexShrink: 1 }}>
        {rows.map((r) => {
          const change = r.sign === "+" || r.sign === "-";
          const isCursor = r.index === cursor;
          const bg =
            r.sign === "+" ? theme.diffAddedBg : r.sign === "-" ? theme.diffRemovedBg : undefined;
          const signColor =
            r.sign === "+" ? theme.added : r.sign === "-" ? theme.removed : theme.faint;
          const text = r.text.length > textWidth ? `${r.text.slice(0, textWidth - 1)}…` : r.text;
          return (
            <box
              key={r.index}
              id={`line-${r.index}`}
              style={{
                flexDirection: "row",
                height: 1,
                backgroundColor: isCursor ? theme.selectionBgMuted : bg,
              }}
            >
              <text style={{ fg: theme.accent, attributes: BOLD }}>{isCursor ? "›" : " "}</text>
              <text style={{ fg: selected.has(r.index) ? theme.added : theme.faint }}>
                {change ? (selected.has(r.index) ? " [x] " : " [ ] ") : "     "}
              </text>
              <text style={{ fg: theme.faint }}>{`${num(r.oldNo)} ${num(r.newNo)} `}</text>
              <text style={{ fg: signColor, attributes: BOLD }}>{r.sign}</text>
              <text style={{ fg: theme.fg }}>{text}</text>
            </box>
          );
        })}
      </scrollbox>
      <box style={{ height: 1, paddingLeft: 1 }}>
        <text style={{ fg: theme.dim }}>
          {`j / k move · space select · a all · [ / ] hunk · Enter ${staged ? "unstage" : "stage"} · Esc done`}
        </text>
      </box>
    </box>
  );
}

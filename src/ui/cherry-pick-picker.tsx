import type { ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import type { CommitEntry } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  branch: string;
  /** Null while loading. Newest-first, same as `git log`. */
  commits: CommitEntry[] | null;
  selectedIndex: number;
  checked: ReadonlySet<string>;
  terminalHeight: number;
}

const MODAL_WIDTH = 72;
// MODAL_WIDTH minus its own padding (1+1), the row's padding (1+1), the
// "[x] " mark (4), the "{shortSha}  " prefix (9), and a "  {date}" suffix (12).
const SUBJECT_WIDTH = MODAL_WIDTH - 2 - 2 - 4 - 9 - 12;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

export function CherryPickPicker({
  branch,
  commits,
  selectedIndex,
  checked,
  terminalHeight,
}: Props) {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);
  // Same sizing as the branch picker: only the list scrolls, so the dialog
  // never outgrows the terminal on a branch that's far ahead.
  const maxRows = Math.max(1, Math.min(12, terminalHeight - 6));
  const listHeight = Math.min(Math.max(commits?.length ?? 1, 1), maxRows);

  useEffect(() => {
    const selected = commits?.[selectedIndex];
    if (selected) scrollboxRef.current?.scrollChildIntoView(`pick-${selected.sha}`);
  }, [commits, selectedIndex]);
  return (
    <box
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: theme.bg,
        zIndex: 120,
      }}
    >
      <box
        title={` Cherry-pick from ${branch} `}
        style={{
          border: true,
          borderColor: theme.borderActive,
          backgroundColor: theme.bg,
          flexDirection: "column",
          padding: 1,
          width: MODAL_WIDTH,
          gap: 1,
        }}
      >
        {commits === null ? (
          <text style={{ fg: theme.faint }}>Loading commits…</text>
        ) : commits.length === 0 ? (
          <text style={{ fg: theme.faint }}>Nothing to pick — HEAD already has every commit.</text>
        ) : (
          <scrollbox ref={scrollboxRef} style={{ height: listHeight }}>
            {commits.map((c, i) => {
              const cursor = i === selectedIndex;
              const fg = cursor ? theme.selectionFg : theme.fg;
              return (
                <box
                  key={c.sha}
                  id={`pick-${c.sha}`}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: cursor ? theme.selectionBg : undefined,
                  }}
                >
                  <text style={{ fg: cursor ? fg : theme.added }}>
                    {checked.has(c.sha) ? "[x] " : "[ ] "}
                  </text>
                  <text
                    style={{ fg: cursor ? fg : theme.accent, attributes: BOLD }}
                  >{`${c.shortSha}  `}</text>
                  <text style={{ fg }}>{truncate(c.subject, SUBJECT_WIDTH)}</text>
                  <text style={{ fg: cursor ? fg : theme.faint, flexGrow: 1 }}>
                    {`  ${c.date}`}
                  </text>
                </box>
              );
            })}
          </scrollbox>
        )}
        <text style={{ fg: theme.dim }}>
          j / k move · space select · Enter pick (current if none) · Esc cancel
        </text>
      </box>
    </box>
  );
}

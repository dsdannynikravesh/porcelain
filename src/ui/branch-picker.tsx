import type { ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import type { Branch } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  branches: Branch[];
  selectedIndex: number;
  terminalHeight: number;
}

function updatedLabel(timestamp: number): string {
  if (!timestamp) return "updated unknown";
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return "updated now";
  if (seconds < 60 * 60) return `updated ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 60 * 60 * 24) return `updated ${Math.floor(seconds / (60 * 60))}h ago`;
  if (seconds < 60 * 60 * 24 * 30) return `updated ${Math.floor(seconds / (60 * 60 * 24))}d ago`;
  return `updated ${Math.floor(seconds / (60 * 60 * 24 * 30))}mo ago`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

export function BranchPicker({ branches, selectedIndex, terminalHeight }: Props) {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);
  // Leave room for the modal's border, padding, title, and keyboard hint. The
  // branch list is the only scrollable part, so the dialog never grows past
  // the terminal even in repositories with hundreds of refs.
  const maxRows = Math.max(1, Math.min(10, terminalHeight - 6));
  const listHeight = Math.min(Math.max(branches.length, 1), maxRows);

  useEffect(() => {
    const selected = branches[selectedIndex];
    if (selected) scrollboxRef.current?.scrollChildIntoView(`branch-${selected.name}`);
  }, [branches, selectedIndex]);

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
        zIndex: 100,
      }}
    >
      <box
        title=" Switch branch "
        style={{
          border: true,
          borderColor: theme.borderActive,
          backgroundColor: theme.bg,
          flexDirection: "column",
          padding: 1,
          width: 64,
          gap: 1,
          height: listHeight + 4,
        }}
      >
        {branches.length === 0 ? (
          <text style={{ fg: theme.faint }}>Loading branches…</text>
        ) : (
          <scrollbox
            ref={scrollboxRef}
            focused={false}
            style={{ height: listHeight, rootOptions: { backgroundColor: theme.bg } }}
          >
            {branches.map((b, i) => {
              const selected = i === selectedIndex;
              const detail = updatedLabel(b.lastCommitAt);
              const branchName = truncate(b.name, Math.max(12, 57 - detail.length));
              const fg = selected
                ? theme.selectionFg
                : b.current
                  ? theme.accent
                  : b.remote
                    ? theme.dim
                    : theme.fg;
              return (
                <box
                  key={b.name}
                  id={`branch-${b.name}`}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: selected ? theme.selectionBg : undefined,
                  }}
                >
                  <box style={{ flexDirection: "row", justifyContent: "space-between", flexGrow: 1 }}>
                    <text style={{ fg, attributes: b.current ? BOLD : undefined }}>
                      {`${b.current ? "● " : "  "}${branchName}`}
                    </text>
                    <text style={{ fg: selected ? theme.selectionFg : theme.faint }}>{detail}</text>
                  </box>
                </box>
              );
            })}
          </scrollbox>
        )}
        <text style={{ fg: theme.dim }}>
          j / k move · enter switch · n new · m merge · d delete · Esc cancel
        </text>
      </box>
    </box>
  );
}

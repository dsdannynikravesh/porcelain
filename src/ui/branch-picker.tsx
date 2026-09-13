import type { Branch } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  branches: Branch[];
  selectedIndex: number;
}

export function BranchPicker({ branches, selectedIndex }: Props) {
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
          width: 48,
          gap: 1,
        }}
      >
        {branches.length === 0 ? (
          <text style={{ fg: theme.faint }}>Loading branches…</text>
        ) : (
          <box style={{ flexDirection: "column" }}>
            {branches.map((b, i) => {
              const selected = i === selectedIndex;
              const fg = selected ? theme.selectionFg : b.current ? theme.accent : theme.fg;
              return (
                <box
                  key={b.name}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: selected ? theme.selectionBg : undefined,
                  }}
                >
                  <text style={{ fg, attributes: b.current ? BOLD : undefined }}>
                    {`${b.current ? "● " : "  "}${b.name}`}
                  </text>
                </box>
              );
            })}
          </box>
        )}
        <text style={{ fg: theme.dim }}>j / k move · enter switch · Esc cancel</text>
      </box>
    </box>
  );
}

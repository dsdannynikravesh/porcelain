import type { StashEntry } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  stashes: StashEntry[];
  selectedIndex: number;
  /** Whether there's anything in the working tree right now to stash. */
  canStash: boolean;
}

export function StashPicker({ stashes, selectedIndex, canStash }: Props) {
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
        title=" Stash "
        style={{
          border: true,
          borderColor: theme.borderActive,
          backgroundColor: theme.bg,
          flexDirection: "column",
          padding: 1,
          width: 60,
          gap: 1,
        }}
      >
        {stashes.length === 0 ? (
          <text style={{ fg: theme.faint }}>No stashes.</text>
        ) : (
          <box style={{ flexDirection: "column" }}>
            {stashes.map((s, i) => {
              const selected = i === selectedIndex;
              return (
                <box
                  key={s.ref}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: selected ? theme.selectionBg : undefined,
                  }}
                >
                  <text
                    style={{ fg: selected ? theme.selectionFg : theme.accent, attributes: BOLD }}
                  >{`${s.ref}  `}</text>
                  <text style={{ fg: selected ? theme.selectionFg : theme.fg }}>{s.subject}</text>
                  <text style={{ fg: selected ? theme.selectionFg : theme.faint, flexGrow: 1 }}>
                    {`  ${s.relativeDate}`}
                  </text>
                </box>
              );
            })}
          </box>
        )}
        <text style={{ fg: canStash ? theme.dim : theme.faint }}>
          {canStash ? "n new stash  ·  " : ""}j / k move · p pop · a apply · d drop · Esc close
        </text>
      </box>
    </box>
  );
}

import type { ReflogEntry } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  entries: ReflogEntry[];
  selectedIndex: number;
}

const MODAL_WIDTH = 64;
// MODAL_WIDTH minus its own padding (1+1), the row's padding (1+1), the
// "{shortSha}  " prefix (9), and a "  {date}" suffix reserved at 16 (git's
// relative dates are always short — "3 minutes ago" etc. — so unlike the
// co-author picker's email column, this one doesn't need its own truncation).
const ACTION_WIDTH = MODAL_WIDTH - 2 - 2 - 9 - 16;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

export function ReflogPicker({ entries, selectedIndex }: Props) {
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
        title=" Undo (reflog) "
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
        {entries.length === 0 ? (
          <text style={{ fg: theme.faint }}>No history yet.</text>
        ) : (
          <box style={{ flexDirection: "column" }}>
            {entries.map((e, i) => {
              const cursor = i === selectedIndex;
              const fg = cursor ? theme.selectionFg : theme.fg;
              return (
                <box
                  // biome-ignore lint/suspicious/noArrayIndexKey: sha can repeat (consecutive checkout/reset events) — position (HEAD@{i}) is real identity here, and this list is never reordered.
                  key={`${e.sha}-${i}`}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: cursor ? theme.selectionBg : undefined,
                  }}
                >
                  <text
                    style={{ fg: cursor ? fg : theme.accent, attributes: BOLD }}
                  >{`${e.shortSha}  `}</text>
                  <text style={{ fg }}>{truncate(e.action, ACTION_WIDTH)}</text>
                  <text style={{ fg: cursor ? fg : theme.faint, flexGrow: 1 }}>
                    {`  ${e.relativeDate}`}
                  </text>
                </box>
              );
            })}
          </box>
        )}
        <text style={{ fg: theme.dim }}>j / k move · Enter reset here · Esc cancel</text>
      </box>
    </box>
  );
}

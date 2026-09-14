import type { Contributor } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  contributors: Contributor[];
  selectedIndex: number;
  /** Emails of the contributors currently checked. */
  checked: ReadonlySet<string>;
}

const MODAL_WIDTH = 56;
const NAME_WIDTH = 20;
// MODAL_WIDTH minus its own padding (1+1), the row's padding (1+1), the
// fixed "[x] "/"[ ] " checkbox (4), NAME_WIDTH, and the "  <>" around the
// email (4) — without this, a long name+email silently gets cut mid-word by
// the row's flex-shrink instead of wrapping, dropping characters rather than
// showing a "…" (the same failure mode as the squash confirm dialog earlier).
const EMAIL_WIDTH = MODAL_WIDTH - 2 - 2 - 4 - NAME_WIDTH - 4;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

export function CoAuthorPicker({ contributors, selectedIndex, checked }: Props) {
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
        title=" Co-authors "
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
        {contributors.length === 0 ? (
          <text style={{ fg: theme.faint }}>No other contributors in this repo yet.</text>
        ) : (
          <box style={{ flexDirection: "column" }}>
            {contributors.map((c, i) => {
              const cursor = i === selectedIndex;
              const isChecked = checked.has(c.email);
              const fg = cursor ? theme.selectionFg : theme.fg;
              return (
                <box
                  key={c.email}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: cursor ? theme.selectionBg : undefined,
                  }}
                >
                  <text
                    style={{
                      fg: cursor ? fg : isChecked ? theme.added : theme.dim,
                      attributes: BOLD,
                    }}
                  >
                    {isChecked ? "[x] " : "[ ] "}
                  </text>
                  <text style={{ fg, attributes: BOLD }}>{truncate(c.name, NAME_WIDTH)}</text>
                  <text style={{ fg: cursor ? fg : theme.faint }}>
                    {`  <${truncate(c.email, EMAIL_WIDTH)}>`}
                  </text>
                </box>
              );
            })}
          </box>
        )}
        <text style={{ fg: theme.dim }}>j / k move · space toggle · Enter / Esc done</text>
      </box>
    </box>
  );
}

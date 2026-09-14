import { BOLD, theme } from "./theme.js";

// Third element marks a key as "essential" — always visible in the collapsed
// footer, not just behind `?`. Keep this list short: it's the one-glance
// cheat sheet, everything else is a keystroke away in the full overlay.
const KEYS: Array<[string, string, boolean?]> = [
  ["j / k", "move", true],
  ["space", "stage file / fold dir", true],
  ["← / l", "collapse / expand dir"],
  ["a", "stage all"],
  ["A", "unstage all"],
  ["c", "commit msg"],
  ["C", "pick co-authors (before writing the message)"],
  ["Enter", "commit (Shift+Enter: new line)", true],
  ["M", "amend"],
  ["p", "pull"],
  ["P", "push"],
  ["F", "force push (--force-with-lease)"],
  ["e", "open in $EDITOR"],
  ["X", "discard"],
  ["d / u", "scroll diff"],
  ["v", "split ⇄ unified"],
  ["w", "wrap lines"],
  ["r", "refresh"],
  ["h", "toggle history"],
  ["b", "switch branch"],
  ["s", "stash"],
  ["S", "squash to here (history tab)"],
  ["o", "open on GitHub"],
  ["z", "undo (reflog)"],
  ["?", "help", true],
  ["q", "quit", true],
];

const ESSENTIAL_KEYS = KEYS.filter(([, , essential]) => essential);

// Sized to the widest row (key column padded to 10 + its description) so the
// modal never clips a line — computed instead of a fixed guess, so adding a
// longer hint to KEYS can't quietly go stale the way this width itself did.
const ROW_BORDER_AND_PADDING = 4; // border (1+1) + box padding (1+1)
export const HELP_MODAL_WIDTH =
  Math.max(...KEYS.map(([k, d]) => Math.max(k.length, 10) + d.length)) + ROW_BORDER_AND_PADDING;

export function HelpFooter({ expanded }: { expanded: boolean }) {
  if (!expanded) {
    return (
      <box style={{ height: 1, paddingLeft: 1, flexDirection: "row" }}>
        <text style={{ fg: theme.faint }}>
          {ESSENTIAL_KEYS.map(([k, d]) => `${k} ${d}`).join("  ·  ")}
          {"  ·  ? more"}
        </text>
      </box>
    );
  }

  return (
    <box
      title=" Keys "
      style={{
        border: true,
        borderColor: theme.borderActive,
        flexDirection: "column",
        padding: 1,
      }}
    >
      {KEYS.map(([k, d]) => (
        <box key={k} style={{ flexDirection: "row", height: 1 }}>
          <text style={{ fg: theme.accent, attributes: BOLD }}>{k.padEnd(10)}</text>
          <text style={{ fg: theme.fg }}>{d}</text>
        </box>
      ))}
      <box style={{ height: 1 }} />
      <text style={{ fg: theme.faint }}>Press ? or Esc to close</text>
    </box>
  );
}

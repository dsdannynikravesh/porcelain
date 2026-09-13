import { BOLD, theme } from "./theme.js";

// Third element marks a key as "essential" — always visible in the collapsed
// footer, not just behind `?`. Keep this list short: it's the one-glance
// cheat sheet, everything else is a keystroke away in the full overlay.
const KEYS: Array<[string, string, boolean?]> = [
  ["j / k", "move", true],
  ["space", "stage file / fold dir", true],
  ["h / l", "collapse / expand dir"],
  ["a", "stage all"],
  ["A", "unstage all"],
  ["c", "commit msg"],
  ["Ctrl+S", "commit", true],
  ["M", "amend"],
  ["p", "pull"],
  ["P", "push"],
  ["Ctrl+P", "force push (--force-with-lease)"],
  ["e", "open in $EDITOR"],
  ["X", "discard"],
  ["d / u", "scroll diff"],
  ["v", "split ⇄ unified"],
  ["w", "wrap lines"],
  ["r", "refresh"],
  ["t", "toggle history"],
  ["b", "switch branch"],
  ["s", "squash to here (history tab)"],
  ["?", "help", true],
  ["q", "quit", true],
];

const ESSENTIAL_KEYS = KEYS.filter(([, , essential]) => essential);

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

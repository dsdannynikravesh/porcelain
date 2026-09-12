import { theme, BOLD } from "./theme.js";

const KEYS: Array<[string, string]> = [
  ["j / k", "move"],
  ["space", "stage file / fold dir"],
  ["h / l", "collapse / expand dir"],
  ["a", "stage all"],
  ["A", "unstage all"],
  ["c", "commit msg"],
  ["Ctrl+S", "commit"],
  ["M", "amend"],
  ["e", "open in $EDITOR"],
  ["X", "discard"],
  ["d / u", "scroll diff"],
  ["v", "split ⇄ unified"],
  ["w", "wrap lines"],
  ["r", "refresh"],
  ["?", "help"],
  ["q", "quit"],
];

export function HelpFooter({ expanded }: { expanded: boolean }) {
  if (!expanded) {
    return (
      <box style={{ height: 1, paddingLeft: 1, flexDirection: "row" }}>
        <text style={{ fg: theme.faint }}>
          {KEYS.slice(0, 8)
            .map(([k, d]) => `${k} ${d}`)
            .join("  ·  ")}
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

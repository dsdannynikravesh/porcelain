import type { GitHubReference } from "../gh/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  references: GitHubReference[];
  selectedIndex: number;
  loading: boolean;
}

export function ReferencePicker({ references, selectedIndex, loading }: Props) {
  return (
    <box
      style={{
        position: "absolute",
        right: 2,
        bottom: 8,
        width: 52,
        border: true,
        borderColor: theme.borderActive,
        backgroundColor: theme.panelBg,
        flexDirection: "column",
        zIndex: 40,
      }}
    >
      {loading ? (
        <text style={{ fg: theme.faint }}>{"  Loading GitHub issues and pull requests…"}</text>
      ) : (
        references.map((reference, index) => {
          const selected = index === selectedIndex;
          return (
            <box
              key={`${reference.kind}-${reference.number}`}
              style={{
                flexDirection: "row",
                height: 1,
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor: selected ? theme.selectionBg : undefined,
              }}
            >
              <text style={{ fg: selected ? theme.selectionFg : theme.accent, attributes: BOLD }}>
                {`#${reference.number}`}
              </text>
              <text
                style={{ fg: selected ? theme.selectionFg : theme.fg }}
              >{`  ${reference.title}`}</text>
            </box>
          );
        })
      )}
      <text style={{ fg: theme.dim }}>{"  ↑ / ↓ select · Enter insert · Esc close"}</text>
    </box>
  );
}

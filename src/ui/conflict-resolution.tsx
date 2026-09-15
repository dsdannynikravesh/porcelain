import type { RepoState } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  repoState: RepoState;
  paths: string[];
  pendingPaths: string[];
  selectedIndex: number;
  busy: boolean;
  notice?: string;
}

export function ConflictResolution({
  repoState,
  paths,
  pendingPaths,
  selectedIndex,
  busy,
  notice,
}: Props) {
  const operation = repoState === "rebasing" ? "Rebase" : "Merge";
  const remainingPaths = [...paths, ...pendingPaths];
  const resolved = remainingPaths.length === 0;

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
        zIndex: 150,
      }}
    >
      <box
        title={` ${operation} conflict `}
        style={{
          border: true,
          borderColor: theme.removed,
          backgroundColor: theme.panelBg,
          flexDirection: "column",
          padding: 1,
          width: 64,
          gap: 1,
        }}
      >
        <text style={{ fg: theme.fg, attributes: BOLD }}>
          {resolved
            ? "All conflict files are staged."
            : paths.length > 0
              ? "Resolve each file before continuing."
              : "Stage the remaining worktree changes before continuing."}
        </text>
        {resolved ? (
          <text style={{ fg: theme.faint }}>
            Continue when you are ready to finish this {operation.toLowerCase()}.
          </text>
        ) : (
          <box style={{ flexDirection: "column" }}>
            {remainingPaths.map((path, index) => {
              const selected = index === selectedIndex;
              return (
                <box
                  key={path}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: selected ? theme.selectionBg : undefined,
                  }}
                >
                  <text
                    style={{ fg: selected ? theme.selectionFg : theme.removed, attributes: BOLD }}
                  >
                    {index < paths.length ? "! " : "• "}
                  </text>
                  <text style={{ fg: selected ? theme.selectionFg : theme.fg }}>{path}</text>
                </box>
              );
            })}
          </box>
        )}
        {notice ? <text style={{ fg: theme.removed }}>{notice}</text> : null}
        <text style={{ fg: theme.dim }}>
          {busy
            ? "Working…"
            : resolved
              ? "c / g continue · G abort"
              : "↑ / ↓ select · e edit · space stage one · g stage + continue · r refresh · G abort"}
        </text>
      </box>
    </box>
  );
}

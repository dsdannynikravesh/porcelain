import type { RepoState } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

/**
 * Persistent, non-modal strip shown whenever a rebase or merge is stopped on
 * conflicts. Deliberately doesn't take over the keyboard — the user resolves
 * files with the regular `e` (open in $EDITOR) binding and stages them like
 * any other change, then presses `g`/`G` from list mode when ready.
 */
export function ConflictBanner({ repoState }: { repoState: RepoState }) {
  if (repoState === "clean") return null;

  const label =
    repoState === "rebasing" ? "Rebase paused on conflicts" : "Merge paused on conflicts";

  return (
    <box
      style={{
        flexDirection: "row",
        height: 1,
        backgroundColor: theme.removed,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text style={{ fg: theme.bg, attributes: BOLD }}>{`⚠ ${label}`}</text>
      <text style={{ fg: theme.bg, flexGrow: 1 }}>
        {"  —  resolve with e, stage, then g to continue · G to abort"}
      </text>
    </box>
  );
}

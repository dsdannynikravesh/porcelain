import type { TreeRow } from "../../state/tree.js";
import type { CommitFileEntry } from "../../git/index.js";
import { theme, BOLD } from "../theme.js";
import { StatusPanelChanges } from "./changes.js";
import { CommittedFiles } from "./committed-files.js";

// The middle pane. In "changes" mode it's model.rows — the collapsible
// working-tree file tree. In "history" mode it's the flat list of files
// changed by whichever commit is selected in the new StatusPanelCommits pane
// to its left (see app.tsx) — same box/header shape, different data source.

export type StatusTab = "changes" | "history";

interface Props {
  activeTab: StatusTab;
  focused: boolean;
  width: number;
  // changes mode
  rows: TreeRow[];
  selectedKey: string | null;
  onSelect?: (key: string) => void;
  onActivate?: (key: string) => void;
  // history mode
  files: CommitFileEntry[];
  selectedPath: string | null;
  onSelectFile?: (path: string) => void;
}

export function StatusPanel({
  activeTab,
  focused,
  width,
  rows,
  selectedKey,
  onSelect,
  onActivate,
  files,
  selectedPath,
  onSelectFile,
}: Props) {
  const isHistory = activeTab === "history";
  const count = isHistory ? files.length : rows.reduce((n, r) => n + (r.type === "file" ? 1 : 0), 0);

  return (
    <box
      title={isHistory ? " Files " : " Changes "}
      style={{
        border: true,
        borderColor: focused ? theme.borderActive : theme.border,
        flexDirection: "column",
        width,
        flexGrow: 1,
        flexShrink: 0,
      }}
    >
      <box style={{ flexDirection: "row", height: 1, paddingLeft: 1 }}>
        <text style={{ fg: theme.dim, attributes: BOLD }}>{isHistory ? "FILES" : "CHANGES"}</text>
        <text style={{ fg: theme.faint }}>{`  ${count}`}</text>
      </box>

      {isHistory ? (
        <CommittedFiles
          files={files}
          selectedPath={selectedPath}
          focused={focused}
          width={width}
          onSelect={onSelectFile}
        />
      ) : (
        <StatusPanelChanges
          rows={rows}
          selectedKey={selectedKey}
          focused={focused}
          width={width}
          onSelect={onSelect}
          onActivate={onActivate}
        />
      )}
    </box>
  );
}

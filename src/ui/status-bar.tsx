import { theme, BOLD } from "./theme.js";
import type { RepoStatus } from "../git/index.js";
import type { Focus } from "./app.js";

interface Props {
  status: RepoStatus | null;
  repoPath: string;
  changeCount: number;
  busy: boolean;
  /** Debug aid: shows which pane is currently receiving keyboard focus. */
  focus: Focus;
}

function shortenPath(p: string): string {
  const home = process.env.HOME;
  const withTilde = home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;
  const parts = withTilde.split("/");
  if (parts.length <= 4) return withTilde;
  return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

export function StatusBar({
  status,
  repoPath,
  changeCount,
  busy,
  focus,
}: Props) {
  const branch = status?.detached
    ? "detached HEAD"
    : (status?.branch ?? "(no branch)");

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const diverged = ahead > 0 && behind > 0;

  return (
    <box
      style={{
        flexDirection: "row",
        height: 1,
        backgroundColor: theme.border,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text
        style={{ fg: theme.headerFg, attributes: BOLD }}
      >{` ${branch} `}</text>
      {status?.upstream ? (
        <text style={{ fg: diverged ? theme.warn : theme.dim }}>
          {`⇡${ahead} ⇣${behind}  `}
        </text>
      ) : (
        <text style={{ fg: theme.faint }}>
          {ahead > 0 ? `${ahead} unpushed  ` : "no upstream  "}
        </text>
      )}
      <text style={{ fg: theme.dim, flexGrow: 1 }}>
        {shortenPath(repoPath)}
      </text>
      <text
        style={{ fg: theme.accent, attributes: BOLD }}
      >{`[${focus}]  `}</text>
      <text style={{ fg: theme.dim }}>
        {busy
          ? "working… "
          : changeCount === 0
            ? "clean"
            : `${changeCount} changed`}
      </text>
    </box>
  );
}

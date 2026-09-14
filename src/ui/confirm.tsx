import { BOLD, theme } from "./theme.js";

export interface ConfirmRequest {
  title: string;
  body: string;
  /** The exact git command that will run, shown verbatim. */
  command: string;
  danger?: boolean;
  run: () => void | Promise<void>;
}

export function Confirm({ request }: { request: ConfirmRequest }) {
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
        // Highest of any overlay — Confirm can be triggered from within any
        // other picker (e.g. undo/reflog, stash drop), and must render above
        // whichever one is still logically "open" underneath it.
        zIndex: 200,
      }}
    >
      <box
        title={` ${request.title} `}
        style={{
          border: true,
          borderColor: request.danger ? theme.removed : theme.borderActive,
          backgroundColor: theme.bg,
          flexDirection: "column",
          padding: 1,
          width: 64,
          gap: 1,
        }}
      >
        <text style={{ fg: theme.fg }}>{request.body}</text>
        <box
          style={{
            backgroundColor: theme.border,
            paddingLeft: 1,
            paddingRight: 1,
            height: 1,
          }}
        >
          <text style={{ fg: theme.headerFg }}>{`$ ${request.command}`}</text>
        </box>
        <box style={{ flexDirection: "row", gap: 2, height: 1 }}>
          <text
            style={{
              fg: request.danger ? theme.removed : theme.added,
              attributes: BOLD,
            }}
          >
            y — confirm
          </text>
          <text style={{ fg: theme.dim }}>n / Esc — cancel</text>
        </box>
      </box>
    </box>
  );
}

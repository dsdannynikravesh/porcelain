import { useEffect, useState } from "react";
import type { RepoStatus } from "../git/index.js";
import type { Toast } from "../state/model.js";
import { BOLD, theme } from "./theme.js";

interface Props {
  status: RepoStatus | null;
  repoPath: string;
  changeCount: number;
  /** null when idle; otherwise a label for whatever's in flight ("Pushing", "Committing", ...). */
  busy: string | null;
  /** Result of the last completed action (e.g. "Pulled Already up to date."). */
  toast: Toast | null;
}

/** A git message can run long; keep the bar to one line regardless. */
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Cycles a braille spinner frame on an interval while `active`; no timer at all when idle. */
function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [active]);
  return SPINNER_FRAMES[frame]!;
}

function shortenPath(p: string): string {
  const home = process.env.HOME;
  const withTilde = home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;
  const parts = withTilde.split("/");
  if (parts.length <= 4) return withTilde;
  return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

/** A small colored pill, e.g. "⇣2 Pull p" — used only when that action is actually available. */
function Chip({ label, color }: { label: string; color: string }) {
  return (
    <box
      style={{
        flexDirection: "row",
        height: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: color,
      }}
    >
      <text style={{ fg: theme.bg, attributes: BOLD }}>{label}</text>
    </box>
  );
}

// Wide enough for the busiest case ("⇣12 Pull p" + "⇡12 Push P", plus chip
// padding) — fixed so the sync area never resizes and shifts the path next
// to it, whether it's showing that, a shorter chip, or plain "Up to date".
const SYNC_SLOT_WIDTH = 26;

export function StatusBar({ status, repoPath, changeCount, busy, toast }: Props) {
  const branch = status?.detached ? "detached HEAD" : (status?.branch ?? "(no branch)");
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const hasSync = ahead > 0 || behind > 0;
  const spin = useSpinner(busy !== null);

  // Busy takes priority (it's happening right now); otherwise show the
  // outcome of whatever just finished; otherwise the idle change count.
  const statusColor = busy
    ? theme.accent
    : toast
      ? toast.kind === "ok"
        ? theme.toastOk
        : toast.kind === "err"
          ? theme.toastErr
          : theme.dim
      : theme.dim;
  const statusText = busy
    ? `${spin} ${busy}… `
    : toast
      ? truncate(toast.text, 50)
      : changeCount === 0
        ? "clean"
        : `${changeCount} changed`;

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
      <text style={{ fg: theme.headerFg, attributes: BOLD }}>{` ${branch} `}</text>

      <box style={{ flexDirection: "row", width: SYNC_SLOT_WIDTH }}>
        {status?.upstream ? (
          hasSync ? (
            <>
              {behind > 0 ? <Chip label={`⇣${behind} Pull p`} color={theme.warn} /> : null}
              {ahead > 0 ? <Chip label={`⇡${ahead} Push P`} color={theme.accent} /> : null}
            </>
          ) : (
            <text style={{ fg: theme.faint }}>{" Up to date"}</text>
          )
        ) : (
          <text style={{ fg: theme.faint }}>{" no upstream"}</text>
        )}
      </box>

      <text style={{ fg: theme.dim, flexGrow: 1 }}>{shortenPath(repoPath)}</text>
      <text style={{ fg: statusColor, attributes: busy || toast ? BOLD : undefined }}>
        {statusText}
      </text>
    </box>
  );
}

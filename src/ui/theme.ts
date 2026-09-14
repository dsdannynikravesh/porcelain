import { TextAttributes } from "@opentui/core";

/** Text attribute bit flags, re-exported for terse `style={{ attributes: BOLD }}`. */
export const BOLD = TextAttributes.BOLD;
export const DIM = TextAttributes.DIM;
export const ITALIC = TextAttributes.ITALIC;

/** Central palette. Kept small and swappable — every UI colour references this. */
export const theme = {
  bg: "#0d1117",
  panelBg: "#0d1117",
  fg: "#c9d1d9",
  dim: "#8b949e",
  faint: "#6e7681",
  border: "#30363d",
  borderActive: "#58a6ff",

  accent: "#58a6ff",
  added: "#3fb950",
  removed: "#f85149",
  modified: "#d29922",
  untracked: "#8b949e",

  selectionBg: "#1f6feb",
  selectionFg: "#ffffff",
  /** Selection highlight for a pane that isn't the one with keyboard focus —
   *  still marks "this is the current row here," just not the vivid blue
   *  reserved for wherever j/k actually act right now. */
  selectionBgMuted: "#21262d",
  headerFg: "#f0f6fc",

  diffAddedBg: "#12261e",
  diffRemovedBg: "#25171c",
  diffContextBg: "#0d1117",

  toastOk: "#3fb950",
  toastErr: "#f85149",
  warn: "#d29922",
} as const;

/** Colour for a status letter / change kind. */
export function kindColor(kind: string): string {
  switch (kind) {
    case "added":
      return theme.added;
    case "deleted":
      return theme.removed;
    case "modified":
    case "type-changed":
      return theme.modified;
    case "renamed":
    case "copied":
      return theme.accent;
    case "untracked":
      return theme.untracked;
    case "unmerged":
      return theme.removed;
    default:
      return theme.fg;
  }
}

/** Single-char badge for a change kind (git porcelain letters). */
export function kindBadge(kind: string): string {
  switch (kind) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "modified":
      return "M";
    case "type-changed":
      return "T";
    case "renamed":
      return "R";
    case "copied":
      return "C";
    case "untracked":
      return "?";
    case "unmerged":
      return "U";
    default:
      return "•";
  }
}

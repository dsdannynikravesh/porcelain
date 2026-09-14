import type { TextareaRenderable } from "@opentui/core";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { Contributor } from "../git/index.js";
import { BOLD, theme } from "./theme.js";

export interface CommitBoxHandle {
  getText: () => string;
  clear: () => void;
  setText: (text: string) => void;
  /** Plain Enter submits (see app.tsx), so Shift+Enter's newline has to be
   *  driven explicitly — the textarea's own default binding only fires on
   *  an unmodified Enter, not "Enter regardless of modifiers." */
  insertNewline: () => void;
}

interface Props {
  focused: boolean;
  amend: boolean;
  /** Set (to the number of commits involved) while squashing history into one. */
  squashCount?: number;
  stagedCount: number;
  /** Picked in the co-author picker (opened via "C" from list mode). */
  coAuthors: Contributor[];
}

/** A small pill, GitHub Desktop–style — one per picked co-author. */
function CoAuthorChip({ name }: { name: string }) {
  return (
    <box
      style={{
        flexDirection: "row",
        height: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.selectionBgMuted,
      }}
    >
      <text style={{ fg: theme.fg }}>{`@ ${name}`}</text>
    </box>
  );
}

export const CommitBox = forwardRef<CommitBoxHandle, Props>(function CommitBox(
  { focused, amend, squashCount, stagedCount, coAuthors },
  ref,
) {
  const areaRef = useRef<TextareaRenderable | null>(null);
  const squashing = squashCount !== undefined;
  const hasCoAuthors = coAuthors.length > 0;

  useImperativeHandle(ref, () => ({
    getText: () => areaRef.current?.plainText ?? "",
    clear: () => areaRef.current?.clear(),
    setText: (text: string) => areaRef.current?.setText(text),
    insertNewline: () => areaRef.current?.newLine(),
  }));

  const hint = amend
    ? "amending HEAD"
    : squashing
      ? `squashing ${squashCount} commits into one`
      : stagedCount === 0
        ? "nothing staged"
        : `${stagedCount} file${stagedCount === 1 ? "" : "s"} staged`;
  const highlighted = amend || squashing;

  return (
    <box
      title={amend ? " Commit — AMEND " : squashing ? " Commit — SQUASH " : " Commit "}
      style={{
        border: true,
        borderColor: focused ? theme.borderActive : theme.border,
        flexDirection: "column",
        // One extra row to fit the co-author chip strip, only when it's shown.
        height: hasCoAuthors ? 6 : 5,
        flexShrink: 0,
      }}
    >
      <textarea
        ref={areaRef}
        focused={focused}
        placeholder="Commit message — Enter to commit, Shift+Enter for a new line, Esc to cancel"
        placeholderColor={theme.faint}
        backgroundColor={theme.panelBg}
        focusedBackgroundColor={theme.panelBg}
        textColor={theme.fg}
        style={{ flexGrow: 1 }}
      />
      {hasCoAuthors ? (
        <box style={{ flexDirection: "row", height: 1, paddingLeft: 1, gap: 1 }}>
          {coAuthors.map((c) => (
            <CoAuthorChip key={c.email} name={c.name} />
          ))}
        </box>
      ) : null}
      <box style={{ flexDirection: "row", height: 1, paddingLeft: 1 }}>
        <text
          style={{
            fg: highlighted ? theme.warn : theme.faint,
            attributes: highlighted ? BOLD : 0,
          }}
        >
          {hint}
        </text>
      </box>
    </box>
  );
});

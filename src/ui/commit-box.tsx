import type { TextareaRenderable } from "@opentui/core";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { BOLD, theme } from "./theme.js";

export interface CommitBoxHandle {
  getText: () => string;
  clear: () => void;
  setText: (text: string) => void;
}

interface Props {
  focused: boolean;
  amend: boolean;
  /** Set (to the number of commits involved) while squashing history into one. */
  squashCount?: number;
  stagedCount: number;
}

export const CommitBox = forwardRef<CommitBoxHandle, Props>(function CommitBox(
  { focused, amend, squashCount, stagedCount },
  ref,
) {
  const areaRef = useRef<TextareaRenderable | null>(null);
  const squashing = squashCount !== undefined;

  useImperativeHandle(ref, () => ({
    getText: () => areaRef.current?.plainText ?? "",
    clear: () => areaRef.current?.clear(),
    setText: (text: string) => areaRef.current?.setText(text),
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
        height: 5,
        flexShrink: 0,
      }}
    >
      <textarea
        ref={areaRef}
        focused={focused}
        placeholder="Commit message — Ctrl+S to commit, Esc to cancel"
        placeholderColor={theme.faint}
        backgroundColor={theme.panelBg}
        focusedBackgroundColor={theme.panelBg}
        textColor={theme.fg}
        style={{ flexGrow: 1 }}
      />
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

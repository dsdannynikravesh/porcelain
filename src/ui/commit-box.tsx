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
  stagedCount: number;
}

export const CommitBox = forwardRef<CommitBoxHandle, Props>(function CommitBox(
  { focused, amend, stagedCount },
  ref,
) {
  const areaRef = useRef<TextareaRenderable | null>(null);

  useImperativeHandle(ref, () => ({
    getText: () => areaRef.current?.plainText ?? "",
    clear: () => areaRef.current?.clear(),
    setText: (text: string) => areaRef.current?.setText(text),
  }));

  const hint = amend
    ? "amending HEAD"
    : stagedCount === 0
      ? "nothing staged"
      : `${stagedCount} file${stagedCount === 1 ? "" : "s"} staged`;

  return (
    <box
      title={amend ? " Commit — AMEND " : " Commit "}
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
            fg: amend ? theme.warn : theme.faint,
            attributes: amend ? BOLD : 0,
          }}
        >
          {hint}
        </text>
      </box>
    </box>
  );
});

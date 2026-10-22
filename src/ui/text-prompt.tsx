import type { InputRenderable } from "@opentui/core";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { theme } from "./theme.js";

export interface TextPromptHandle {
  getValue: () => string;
  clear: () => void;
}

interface Props {
  /** Box title, e.g. "New branch". */
  title: string;
  placeholder: string;
  /** Key hint under the input, e.g. "Enter create · Esc cancel". */
  hint: string;
  /** Text the input starts with — e.g. the filter already in effect. */
  initialValue?: string;
}

/**
 * A one-line text input in a centered modal. The caller owns the keys that
 * matter (Enter / Esc, in app.tsx's keyboard handler) and reads the value
 * through the ref; the input itself just takes the typing.
 */
export const TextPrompt = forwardRef<TextPromptHandle, Props>(function TextPrompt(
  { title, placeholder, hint, initialValue },
  ref,
) {
  const inputRef = useRef<InputRenderable | null>(null);

  useImperativeHandle(ref, () => ({
    getValue: () => inputRef.current?.value ?? "",
    clear: () => {
      if (inputRef.current) inputRef.current.value = "";
    },
  }));

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
        zIndex: 110,
      }}
    >
      <box
        title={` ${title} `}
        style={{
          border: true,
          borderColor: theme.borderActive,
          backgroundColor: theme.bg,
          flexDirection: "column",
          padding: 1,
          width: 48,
          gap: 1,
        }}
      >
        <input
          ref={inputRef}
          focused
          value={initialValue}
          placeholder={placeholder}
          placeholderColor={theme.faint}
          backgroundColor={theme.panelBg}
          focusedBackgroundColor={theme.panelBg}
          textColor={theme.fg}
        />
        <text style={{ fg: theme.dim }}>{hint}</text>
      </box>
    </box>
  );
});

import type { InputRenderable } from "@opentui/core";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { theme } from "./theme.js";

export interface NewBranchPromptHandle {
  getValue: () => string;
  clear: () => void;
}

export const NewBranchPrompt = forwardRef<NewBranchPromptHandle, object>(
  function NewBranchPrompt(_props, ref) {
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
          title=" New branch "
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
            placeholder="branch name"
            placeholderColor={theme.faint}
            backgroundColor={theme.panelBg}
            focusedBackgroundColor={theme.panelBg}
            textColor={theme.fg}
          />
          <text style={{ fg: theme.dim }}>Enter create · Esc cancel</text>
        </box>
      </box>
    );
  },
);

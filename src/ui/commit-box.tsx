import type { InputRenderable, TextareaRenderable } from "@opentui/core";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { Contributor } from "../git/index.js";
import { useSpinner } from "./status-bar.js";
import { BOLD, theme } from "./theme.js";

export interface CommitBoxHandle {
  /** Combined "title\n\ndescription" (just the title if there's no
   *  description) — what actually goes to `git commit -m`. */
  getText: () => string;
  clear: () => void;
  /** Splits `text` on its first line — the rest (minus the blank line
   *  git's own convention puts there) becomes the description. Used to
   *  prefill from a single string (amend, squash). */
  setText: (text: string) => void;
  /** Sets both fields directly — the Copilot-generate flow already has them
   *  as separate strings, so this skips `setText`'s split heuristic. */
  setGenerated: (title: string, description: string) => void;
  /** Replaces the `#` token immediately before the active field's cursor. */
  insertReference: (number: number) => void;
  /** Plain Enter submits (see app.tsx), so a newline in the description has
   *  to be driven explicitly — the textarea's own default binding only
   *  fires on an unmodified Enter, not "Enter regardless of modifiers." */
  insertNewline: () => void;
}

/** Which of the box's two fields currently has keyboard focus. */
export type CommitField = "summary" | "description";

interface Props {
  focused: boolean;
  field: CommitField;
  amend: boolean;
  /** Set (to the number of commits involved) while squashing history into one. */
  squashCount?: number;
  stagedCount: number;
  /** Picked in the co-author picker (opened via "C" from list mode). */
  coAuthors: Contributor[];
  /** True while a Copilot commit-message request is in flight. */
  generating: boolean;
  onGenerate: () => void;
  /** The partial issue/PR number immediately before the cursor, after `#`. */
  onReferenceQuery: (query: string | null) => void;
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
  {
    focused,
    field,
    amend,
    squashCount,
    stagedCount,
    coAuthors,
    generating,
    onGenerate,
    onReferenceQuery,
  },
  ref,
) {
  const summaryRef = useRef<InputRenderable | null>(null);
  const descriptionRef = useRef<TextareaRenderable | null>(null);
  const squashing = squashCount !== undefined;
  const hasCoAuthors = coAuthors.length > 0;

  useImperativeHandle(ref, () => ({
    getText: () => {
      const title = summaryRef.current?.plainText.trim() ?? "";
      const description = descriptionRef.current?.plainText.trim() ?? "";
      return description ? `${title}\n\n${description}` : title;
    },
    clear: () => {
      summaryRef.current?.clear();
      descriptionRef.current?.clear();
    },
    setText: (text: string) => {
      const firstNewline = text.indexOf("\n");
      const title = firstNewline === -1 ? text : text.slice(0, firstNewline);
      const rest = firstNewline === -1 ? "" : text.slice(firstNewline + 1).replace(/^\n+/, "");
      summaryRef.current?.setText(title);
      descriptionRef.current?.setText(rest);
    },
    setGenerated: (title: string, description: string) => {
      summaryRef.current?.setText(title);
      descriptionRef.current?.setText(description);
    },
    insertNewline: () => {
      descriptionRef.current?.newLine();
    },
    insertReference: (number: number) => {
      const target = field === "summary" ? summaryRef.current : descriptionRef.current;
      if (!target) return;
      const beforeCursor = target.plainText.slice(0, target.cursorOffset);
      const match = /(?:^|[^\w])#\d*$/.exec(beforeCursor);
      if (!match) return;
      const start = target.cursorOffset - match[0].length + match[0].lastIndexOf("#");
      target.setSelection(start, target.cursorOffset);
      target.insertText(`#${number}`);
    },
  }));

  const updateReferenceQuery = (target: InputRenderable | TextareaRenderable | null) => {
    if (!target) return onReferenceQuery(null);
    const beforeCursor = target.plainText.slice(0, target.cursorOffset);
    const match = /(?:^|[^\w])#(\d*)$/.exec(beforeCursor);
    onReferenceQuery(match?.[1] ?? null);
  };

  const hint = amend
    ? "amending HEAD"
    : squashing
      ? `squashing ${squashCount} commits into one`
      : stagedCount === 0
        ? "nothing staged"
        : `${stagedCount} file${stagedCount === 1 ? "" : "s"} staged`;
  const highlighted = amend || squashing;
  const canGenerate = stagedCount > 0 && !generating;
  const spinner = useSpinner(generating);

  return (
    <box
      title={amend ? " Commit — AMEND " : squashing ? " Commit — SQUASH " : " Commit "}
      style={{
        border: true,
        borderColor: focused ? theme.borderActive : theme.border,
        flexDirection: "column",
        // Summary(1) + divider(1) + description(3) + generate/hint row(1),
        // plus one more for the co-author chip strip when it's shown.
        height: hasCoAuthors ? 9 : 8,
        flexShrink: 0,
      }}
    >
      <input
        ref={summaryRef}
        focused={focused && field === "summary"}
        placeholder="Summary — Enter to commit, Tab for description, Esc to cancel"
        placeholderColor={theme.faint}
        backgroundColor={theme.panelBg}
        focusedBackgroundColor={theme.panelBg}
        textColor={theme.fg}
        onInput={() => updateReferenceQuery(summaryRef.current)}
      />
      <box style={{ border: ["top"], borderColor: theme.border, height: 1 }} />
      <textarea
        ref={descriptionRef}
        focused={focused && field === "description"}
        placeholder="Description (optional)"
        placeholderColor={theme.faint}
        backgroundColor={theme.panelBg}
        focusedBackgroundColor={theme.panelBg}
        textColor={theme.fg}
        style={{ flexGrow: 1 }}
        onContentChange={() => updateReferenceQuery(descriptionRef.current)}
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
          style={{ fg: highlighted ? theme.warn : theme.faint, attributes: highlighted ? BOLD : 0 }}
        >
          {hint}
        </text>
        {stagedCount > 0 ? (
          <>
            <text style={{ fg: theme.faint }}>{"   ·   "}</text>
            <box
              onMouseDown={(e) => {
                if (e.button === 0 && canGenerate) onGenerate();
              }}
              style={{ flexDirection: "row" }}
            >
              <text style={{ fg: canGenerate ? theme.accent : theme.faint, attributes: BOLD }}>
                {generating ? spinner : ""}
              </text>
              <text style={{ fg: canGenerate ? theme.fg : theme.faint }}>
                {generating ? "  Generating…" : "  Generate (^G)"}
              </text>
            </box>
          </>
        ) : null}
      </box>
    </box>
  );
});

import { spawn } from "node:child_process";
import type { CliRenderer } from "@opentui/core";

/** First changed line in the new file, parsed from a unified diff's first hunk. */
export function firstHunkLine(patch: string): number | undefined {
  const m = patch.match(/^@@ -\d+(?:,\d+)? \+(\d+)/m);
  return m ? Number(m[1]) : undefined;
}

const SUPPORTS_PLUS_LINE = /(^|\/)(n?vim?|vi|nano|emacs|kak|hx|helix)(\s|$)/;

/**
 * Hand the terminal to the user's editor to open `file`, then reclaim it.
 * Honours VISUAL / EDITOR (falls back to vi); `+line` is added only for
 * editors known to accept it.
 */
export async function openInEditor(
  renderer: CliRenderer,
  opts: { file: string; line?: number; cwd: string },
): Promise<void> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";

  const parts: string[] = [editor];
  if (opts.line && SUPPORTS_PLUS_LINE.test(editor)) parts.push(`+${opts.line}`);
  parts.push(JSON.stringify(opts.file));

  renderer.suspend();
  try {
    await new Promise<void>((resolve) => {
      const child = spawn(parts.join(" "), {
        stdio: "inherit",
        cwd: opts.cwd,
        shell: true,
      });
      child.on("error", () => resolve());
      child.on("exit", () => resolve());
    });
  } finally {
    renderer.resume();
  }
}

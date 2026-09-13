#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { findRepoRoot, setGitCwd } from "./git/index.js";
import { App } from "./ui/app.js";

async function main() {
  const startDir = process.cwd();
  const root = await findRepoRoot(startDir);

  if (!root) {
    process.stderr.write(
      `gitpretty: ${startDir} is not inside a git repository.\n` +
        `Run it from a repo, or 'git init' first.\n`,
    );
    process.exit(1);
  }

  setGitCwd(root);

  const renderer = await createCliRenderer({
    // Ctrl+C is handled at OpenTUI's input layer (calls renderer.destroy()), so
    // it still works to bail out even if the React tree has crashed.
    exitOnCtrlC: true,
    targetFps: 60,
    useMouse: true,
  });

  const root_ = createRoot(renderer);
  root_.render(<App />);

  const shutdown = () => {
    try {
      root_.unmount();
      renderer.destroy();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`gitpretty: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

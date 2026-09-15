#!/usr/bin/env bun
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";

/** Configure copied OpenTUI assets before importing OpenTUI itself. */
function configureStandaloneAssets() {
  const assetRoot = `${realpathSync(process.execPath)}.assets`;
  if (existsSync(join(assetRoot, "@opentui/core/parser.worker.js"))) {
    process.env.OTUI_ASSET_ROOT = assetRoot;
  }
}

async function main() {
  configureStandaloneAssets();

  // React imports core internally, so let core finish its async module setup
  // before loading React (parallel evaluation creates a circular-init error).
  const { createCliRenderer } = await import("@opentui/core");
  const { createRoot } = await import("@opentui/react");
  const [{ setGHCwd }, { findRepoRoot, setGitCwd }, { App }] = await Promise.all([
    import("./gh/index.js"),
    import("./git/index.js"),
    import("./ui/app.js"),
  ]);

  const startDir = process.cwd();
  const root = await findRepoRoot(startDir);

  if (!root) {
    process.stderr.write(
      `porcelain: ${startDir} is not inside a git repository.\n` +
        `Run it from a repo, or 'git init' first.\n`,
    );
    process.exit(1);
  }

  setGitCwd(root);
  setGHCwd(root);

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
  process.stderr.write(`porcelain: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

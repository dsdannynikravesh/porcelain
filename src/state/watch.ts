import { watch } from "node:fs";
import { useEffect } from "react";
import { getGitCwd } from "../git/index.js";

/**
 * Watch the repo for changes and call `onChange` (debounced). Ignores churn
 * inside `.git/` except for index/HEAD/refs, which reflect staging & commits.
 */
export function useRepoWatch(onChange: () => void, delayMs = 250): void {
  useEffect(() => {
    const root = getGitCwd();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, delayMs);
    };

    const relevantGitPath = (p: string) =>
      /(^|\/)(index|HEAD|ORIG_HEAD|MERGE_HEAD)$/.test(p) ||
      /(^|\/)refs\//.test(p) ||
      // rebase-merge/rebase-apply are directories that appear/disappear (and
      // churn internally) exactly when entering/progressing/leaving a rebase.
      /(^|\/)(rebase-merge|rebase-apply)(\/|$)/.test(p);

    let watcher: ReturnType<typeof watch> | null = null;
    try {
      watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) {
          fire();
          return;
        }
        const name = filename.toString();
        if (name.includes(".git/") || name.startsWith(".git")) {
          if (relevantGitPath(name)) fire();
          return;
        }
        fire();
      });
    } catch {
      // Recursive watch is unsupported on some platforms; fall back to nothing.
    }

    return () => {
      if (timer) clearTimeout(timer);
      watcher?.close();
    };
  }, [onChange, delayMs]);
}

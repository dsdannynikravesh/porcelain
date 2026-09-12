# gitpretty

A polished terminal Git client, built with [OpenTUI](https://opentui.com).
The part of GitHub Desktop worth missing — seeing your changes clearly and
committing them without second-guessing — in a fast TUI that stays in your
terminal.

**v1 scope:** working-tree status (as a collapsible folder tree), a side-by-side
diff (old left / new right) with syntax highlighting, file-level staging, and
commit (incl. amend). Push / pull / history are next.

Syntax highlighting covers **ts / tsx / js / jsx / markdown** (the grammars
OpenTUI bundles). Other languages render plain until a tree-sitter parser is
registered for them — see `src/ui/syntax.ts`.

## Run it

```bash
bun install
bun start          # opens on the repo containing $CWD
```

Or build a standalone binary (no Bun needed to run it):

```bash
bun run build      # writes dist/gitpretty-<host-os>-<arch>
```

`bun run build` compiles for the **host platform only** — OpenTUI's Zig renderer
is a per-platform native package and only the host's is installed. Ship macOS +
Linux binaries from a CI matrix (macos-latest + ubuntu-latest) running the same
command.

## Keys

| Key        | Action                          |
|------------|---------------------------------|
| `j` / `k`  | move selection                  |
| `space`    | stage/unstage a file · fold/unfold a directory |
| `h` / `l`  | collapse / expand the selected directory |
| `a` / `A`  | stage all / unstage all         |
| `c`        | jump to the commit message      |
| `Ctrl+S`   | commit (confirms first on amend)|
| `M`        | amend the last commit           |
| `e`        | open the file in `$VISUAL`/`$EDITOR` |
| `X`        | discard the file's changes      |
| `d` / `u`  | scroll the diff                 |
| `v`        | toggle split / unified diff     |
| `w`        | toggle line wrapping in the diff |
| `n`        | toggle diff line numbers        |
| `r`        | refresh                         |
| `?`        | help                            |
| `q`        | quit                            |

The working tree is watched, so external changes (editor saves, other git
commands) refresh the view automatically.

## Layout

```
src/
  index.tsx        entry — resolves the repo root, mounts <App/>
  git/             thin async wrappers around the system `git` binary
    exec.ts          runGit(); repo-root resolution
    status.ts        porcelain-v2 parser -> RepoStatus
    diff.ts          unified diff per file (+ untracked synthesis)
    stage.ts         add / restore / discard
    commit.ts        commit / amend / staged-check
  state/
    model.ts         useRepoModel() — single source of repo truth
    watch.ts         debounced fs watch -> refresh
  ui/                OpenTUI React components (App, StatusPanel, DiffPanel, …)
```

`git/` never uses a Git library — it shells out to `git` and parses porcelain,
the same approach lazygit takes, so every operation has full fidelity.

## Tests

```bash
bun test           # git layer, against throwaway repos
bun run typecheck
```

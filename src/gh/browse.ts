import { runGH } from "./exec.js";

export interface BrowseOutcome {
  ok: boolean;
  message: string;
}

/**
 * Unlike git, the `gh` CLI isn't a hard dependency of this app — plenty of
 * git users don't have it installed — so this never throws: a missing
 * binary, no GitHub remote, or any other failure all come back as a normal
 * {ok: false} outcome for the caller to toast, same as every other action.
 */
export async function browse(): Promise<BrowseOutcome> {
  let res: Awaited<ReturnType<typeof runGH>>;
  try {
    res = await runGH(["browse"]);
  } catch (err) {
    const notFound =
      typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
    return {
      ok: false,
      message: notFound
        ? "gh CLI not found — install it to use this"
        : err instanceof Error
          ? err.message
          : String(err),
    };
  }

  const line = (res.stderr || res.stdout).trim().split("\n")[0] ?? "";
  if (res.code !== 0) {
    return { ok: false, message: line || "gh browse failed" };
  }
  return { ok: true, message: line || "Opened in browser" };
}

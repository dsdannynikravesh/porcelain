export interface GeneratedCommitMessage {
  title: string;
  description: string;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

function unescapeJsonLikeString(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

/** Regex-based last resort for when the model's JSON has an unescaped
 *  newline inside a string (technically invalid JSON, but a common enough
 *  slip that it's worth recovering from rather than failing outright). */
function extractJsonLikeField(raw: string, field: "title" | "description"): string | undefined {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?=,\\s*"|\\s*})`);
  const match = raw.match(pattern);
  return match ? unescapeJsonLikeString(match[1]!) : undefined;
}

function parseJsonLikeResponse(raw: string): GeneratedCommitMessage | null {
  const title = extractJsonLikeField(raw, "title");
  if (title === undefined) return null;
  const description = extractJsonLikeField(raw, "description") ?? "";
  return { title: title.trim(), description: description.trim() };
}

/**
 * Parses Copilot's response into `{title, description}` — tries strict JSON
 * first (after stripping a markdown fence, if the model added one despite
 * being told not to), then falls back to regex field extraction for a
 * near-miss (e.g. an unescaped newline inside a string) rather than failing
 * outright on an otherwise-usable response.
 */
export function parseGeneratedCommitMessage(raw: string): GeneratedCommitMessage {
  const stripped = stripCodeFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const fallback = parseJsonLikeResponse(stripped);
    if (fallback) return fallback;
    throw new Error("Copilot didn't return a valid commit message — try again.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).title !== "string" ||
    ((parsed as Record<string, unknown>).title as string).trim() === ""
  ) {
    throw new Error("Copilot's response didn't include a commit title.");
  }

  const title = ((parsed as Record<string, unknown>).title as string).trim();
  const descriptionRaw = (parsed as Record<string, unknown>).description;
  const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";
  return { title, description };
}

import { SyntaxStyle } from "@opentui/core";
import { theme } from "./theme.js";

/**
 * Colours for tree-sitter capture names. OpenTUI bundles grammars for
 * typescript / javascript / markdown (+ zig); other filetypes fall back to
 * plain text until a parser is registered for them.
 *
 * Keys are nvim-treesitter capture names; OpenTUI resolves hierarchically, so
 * "function" also covers "function.call", "function.method", etc.
 */
export const syntaxStyle = SyntaxStyle.fromStyles({
  keyword: { fg: "#ff7b72" },
  "keyword.import": { fg: "#ff7b72" },
  "keyword.return": { fg: "#ff7b72" },
  "keyword.operator": { fg: "#ff7b72" },
  operator: { fg: theme.fg },
  string: { fg: "#a5d6ff" },
  "string.escape": { fg: "#79c0ff" },
  number: { fg: "#79c0ff" },
  boolean: { fg: "#79c0ff" },
  constant: { fg: "#79c0ff" },
  "constant.builtin": { fg: "#79c0ff" },
  function: { fg: "#d2a8ff" },
  constructor: { fg: "#d2a8ff" },
  type: { fg: "#ffa657" },
  "type.builtin": { fg: "#ffa657" },
  module: { fg: "#ffa657" },
  property: { fg: "#79c0ff" },
  "variable.member": { fg: "#79c0ff" },
  "variable.parameter": { fg: theme.fg },
  variable: { fg: theme.fg },
  comment: { fg: theme.faint, italic: true },
  "punctuation.bracket": { fg: theme.dim },
  "punctuation.delimiter": { fg: theme.dim },
  "markup.heading": { fg: "#d2a8ff", bold: true },
  "markup.raw": { fg: "#a5d6ff" },
  "markup.link.url": { fg: "#a5d6ff", underline: true },
  "markup.list": { fg: "#ff7b72" },
});

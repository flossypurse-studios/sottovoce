// Snippet extraction: whole files, editor-native #region markers, or line ranges.
//
// Region markers are the ones editors already fold on, so example code stays
// readable on its own:
//
//   // #region purchase
//   ...
//   // #endregion
//
// Any common comment leader works (//, #, --, ;, ', %, /* */, <!-- -->).

// The comment leader is optional so bare `#region` (C#) works too.
const REGION_START =
  /^\s*(?:\/\/|--|;|'|%|\/\*|<!--|#(?!region|endregion))?\s*#region\b[ \t]*(.*?)\s*(?:\*\/|-->)?\s*$/;
const REGION_END =
  /^\s*(?:\/\/|--|;|'|%|\/\*|<!--|#(?!region|endregion))?\s*#endregion\b.*$/;

export class ExtractError extends Error {}

export function extractRegion(sourceText: string, region: string): string[] {
  const lines = sourceText.split(/\r?\n/);
  let depth = 0;
  let found = false;
  const collected: string[] = [];

  for (const line of lines) {
    const start = REGION_START.exec(line);
    if (start) {
      if (found) {
        depth++;
        continue; // nested region markers are tool plumbing — drop them
      }
      if ((start[1] ?? "").trim() === region) {
        found = true;
        depth = 1;
      }
      continue;
    }
    if (REGION_END.test(line)) {
      if (found) {
        depth--;
        if (depth === 0) return collected;
      }
      continue;
    }
    if (found) collected.push(line);
  }

  if (!found) throw new ExtractError(`region "${region}" not found`);
  throw new ExtractError(`region "${region}" is never closed (#endregion missing)`);
}

export function extractLines(
  sourceText: string,
  range: { start: number; end: number },
): string[] {
  const lines = sourceText.split(/\r?\n/);
  // Drop the phantom element a trailing newline produces, so lines=N+1 on an
  // N-line file is out of range rather than an empty snippet.
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (range.end > lines.length) {
    throw new ExtractError(
      `lines=${range.start}-${range.end} out of range (file has ${lines.length} lines)`,
    );
  }
  return lines.slice(range.start - 1, range.end);
}

export function wholeFile(sourceText: string): string[] {
  return sourceText.split(/\r?\n/);
}

/** Normalize a snippet: strip stray region markers, blank edges, common indent. */
export function tidy(lines: string[]): string[] {
  let out = lines.filter(
    (l) => !REGION_START.test(l) && !REGION_END.test(l),
  );

  while (out.length && (out[0] ?? "").trim() === "") out = out.slice(1);
  while (out.length && (out[out.length - 1] ?? "").trim() === "") out = out.slice(0, -1);

  const nonBlank = out.filter((l) => l.trim() !== "");
  if (nonBlank.length) {
    let prefix = /^[ \t]*/.exec(nonBlank[0] ?? "")?.[0] ?? "";
    for (const line of nonBlank) {
      while (prefix && !line.startsWith(prefix)) {
        prefix = prefix.slice(0, -1);
      }
      if (!prefix) break;
    }
    if (prefix) out = out.map((l) => (l.trim() === "" ? "" : l.slice(prefix.length)));
  }

  return out.map((l) => l.replace(/[ \t]+$/, ""));
}

const LANG_BY_EXT: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  mts: "ts",
  cts: "ts",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  swift: "swift",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  json: "json",
  jsonc: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "mdx",
  html: "html",
  css: "css",
  scad: "openscad",
  proto: "protobuf",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  tf: "hcl",
};

export function inferLang(filePath: string): string {
  const base = filePath.split("/").pop() ?? "";
  if (/^dockerfile$/i.test(base)) return "dockerfile";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return LANG_BY_EXT[ext] ?? "";
}

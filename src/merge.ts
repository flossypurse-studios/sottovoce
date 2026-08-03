import { matchDirective } from "./directive.js";
import {
  ExtractError,
  extractLines,
  extractRegion,
  inferLang,
  tidy,
  wholeFile,
} from "./extract.js";
import type { Directive, FileResult, SnippetProblem } from "./types.js";

export type SnippetReader = (directive: Directive) => string;

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/;

interface Fence {
  openIndex: number;
  closeIndex: number;
  indent: string;
  char: string;
  info: string;
}

function findFence(lines: string[], from: number): Fence | null | "unclosed" {
  let i = from;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i++;
  const open = i < lines.length ? FENCE_OPEN.exec(lines[i] ?? "") : null;
  if (!open) return null;
  const indent = open[1] ?? "";
  const marker = open[2] ?? "```";
  const char = marker[0] ?? "`";
  const closeRe = new RegExp(`^\\s*${char === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
  for (let j = i + 1; j < lines.length; j++) {
    if (closeRe.test(lines[j] ?? "")) {
      return { openIndex: i, closeIndex: j, indent, char, info: (open[3] ?? "").trim() };
    }
  }
  return "unclosed";
}

function renderFence(
  snippet: string[],
  indent: string,
  char: string,
  info: string,
): string[] {
  // Widen the fence past any backtick/tilde runs inside the snippet itself.
  let maxRun = 0;
  const runRe = char === "`" ? /`+/g : /~+/g;
  for (const line of snippet) {
    for (const m of line.matchAll(runRe)) {
      if (m[0].length > maxRun) maxRun = m[0].length;
    }
  }
  const marker = char.repeat(Math.max(3, maxRun + 1));
  const body = snippet.map((l) => (l === "" ? "" : indent + l));
  return [indent + marker + info, ...body, indent + marker];
}

/**
 * Process one docs file: find every sotto directive, extract its snippet, and
 * rewrite (or insert) the code fence that follows it. Pure function — returns
 * new content, writes nothing.
 */
export function mergeDoc(
  file: string,
  content: string,
  readSnippet: SnippetReader,
): FileResult {
  // CRLF files are processed on stripped lines and re-joined with their own
  // line endings, so unchanged CRLF docs stay byte-identical.
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = content.endsWith("\n");
  const lines = content
    .split("\n")
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (trailingNewline) lines.pop();

  const out: string[] = [];
  const problems: SnippetProblem[] = [];
  let updated = 0;
  let unchanged = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    let match = null;
    try {
      match = matchDirective(line, i + 1);
    } catch (err) {
      problems.push({ file, line: i + 1, message: (err as Error).message });
      out.push(line);
      i++;
      continue;
    }
    if (!match) {
      out.push(line);
      i++;
      // A fence that isn't owned by a directive is opaque — its contents may
      // show literal directive examples and must not be interpreted.
      const open = FENCE_OPEN.exec(line);
      if (open) {
        const marker = open[2] ?? "```";
        const char = marker[0] ?? "`";
        const closeRe = new RegExp(
          `^\\s*${char === "`" ? "`" : "~"}{${marker.length},}\\s*$`,
        );
        while (i < lines.length) {
          const inner = lines[i] ?? "";
          out.push(inner);
          i++;
          if (closeRe.test(inner)) break;
        }
      }
      continue;
    }

    out.push(line);
    const { directive, indent } = match;

    let snippet: string[] | null = null;
    try {
      const text = readSnippet(directive);
      if (directive.region) snippet = extractRegion(text, directive.region);
      else if (directive.lines) snippet = extractLines(text, directive.lines);
      else snippet = wholeFile(text);
      snippet = tidy(snippet);
      if (snippet.length === 0) {
        throw new ExtractError("snippet is empty");
      }
    } catch (err) {
      problems.push({
        file,
        line: i + 1,
        message: `${directive.raw}: ${(err as Error).message}`,
      });
    }

    const fence = findFence(lines, i + 1);
    if (fence === "unclosed") {
      problems.push({ file, line: i + 1, message: `${directive.raw}: unclosed code fence` });
    }

    if (snippet === null || fence === "unclosed") {
      // Leave whatever is there untouched.
      i++;
      continue;
    }

    const lang = directive.lang ?? inferLang(directive.path);

    if (fence === null) {
      out.push(...renderFence(snippet, indent, "`", lang));
      updated++;
      i++;
      continue;
    }

    // Preserve blank lines between directive and fence, and the author's own
    // info string (highlight ranges, titles) when present.
    for (let j = i + 1; j < fence.openIndex; j++) out.push(lines[j] ?? "");
    const info = fence.info !== "" ? fence.info : lang;
    const rendered = renderFence(snippet, fence.indent, fence.char, info);
    const existing = lines.slice(fence.openIndex, fence.closeIndex + 1);
    if (existing.join("\n") === rendered.join("\n")) unchanged++;
    else updated++;
    out.push(...rendered);
    i = fence.closeIndex + 1;
  }

  const newContent = out.join(eol) + (trailingNewline ? eol : "");
  return {
    file,
    updated,
    unchanged,
    problems,
    content: newContent !== content ? newContent : undefined,
  };
}

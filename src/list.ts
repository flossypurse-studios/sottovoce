import { matchDirective } from "./directive.js";
import { FENCE_OPEN, findFence } from "./merge.js";

/** One directive found by `list` — a parse-only inventory row. */
export interface ListEntry {
  file: string;
  /** Line number (1-based) of the directive. */
  line: number;
  source: string;
  path: string;
  region?: string;
  lines?: { start: number; end: number };
  lang?: string;
  /** Whether the source name exists in the config's `sources` map. */
  sourceKnown: boolean;
  /** Whether a code fence already follows the directive. */
  hasFence: boolean;
}

/** A directive line whose body failed to parse. */
export interface ListInvalid {
  file: string;
  line: number;
  error: string;
}

export interface ListResult {
  entries: ListEntry[];
  invalid: ListInvalid[];
}

/**
 * Inventory every sotto directive in one docs file. Pure and parse-only — no
 * source resolution, no filesystem. Walks fences exactly like mergeDoc so
 * literal directive examples inside non-owned fences are not listed.
 */
export function listDoc(
  file: string,
  content: string,
  knownSources: ReadonlySet<string>,
): ListResult {
  const lines = content
    .split("\n")
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));

  const entries: ListEntry[] = [];
  const invalid: ListInvalid[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    let match = null;
    try {
      match = matchDirective(line, i + 1);
    } catch (err) {
      invalid.push({ file, line: i + 1, error: (err as Error).message });
      i++;
      continue;
    }
    if (!match) {
      i++;
      // Skip fences not owned by a directive — same rule as mergeDoc.
      const open = FENCE_OPEN.exec(line);
      if (open) {
        const marker = open[2] ?? "```";
        const char = marker[0] ?? "`";
        const closeRe = new RegExp(
          `^\\s*${char === "`" ? "`" : "~"}{${marker.length},}\\s*$`,
        );
        while (i < lines.length) {
          const inner = lines[i] ?? "";
          i++;
          if (closeRe.test(inner)) break;
        }
      }
      continue;
    }

    const d = match.directive;
    const fence = findFence(lines, i + 1);
    entries.push({
      file,
      line: d.line,
      source: d.source,
      path: d.path,
      region: d.region,
      lines: d.lines,
      lang: d.lang,
      sourceKnown: knownSources.has(d.source),
      hasFence: fence !== null,
    });

    if (fence !== null && fence !== "unclosed") {
      i = fence.closeIndex + 1;
    } else {
      i++;
    }
  }

  return { entries, invalid };
}

/** A parsed `sotto` directive found in a docs file. */
export interface Directive {
  /** Key into the config's `sources` map. */
  source: string;
  /** Path of the snippet file, relative to the source root. */
  path: string;
  /** Optional `#region` selector: a region name, or several joined with `+`. */
  region?: string;
  /** Optional 1-based inclusive line range, e.g. `lines=4-9` or `lines=4`. */
  lines?: { start: number; end: number };
  /** Optional language override for the code fence info string. */
  lang?: string;
  /** Line number (1-based) of the directive in the docs file. */
  line: number;
  /** The raw directive body, for error messages. */
  raw: string;
}

export interface SourceRepo {
  repo: string;
  ref?: string;
}

export interface SourcePath {
  path: string;
}

export type SourceSpec = SourceRepo | SourcePath;

export interface Config {
  /** Globs (relative to the config file) selecting docs files to process. */
  docs: string[];
  /** Named snippet sources. */
  sources: Record<string, SourceSpec>;
}

export interface SnippetProblem {
  file: string;
  line: number;
  message: string;
}

/** Expected-vs-current fence bodies for one drifted directive. */
export interface FenceDrift {
  /** Directive line (1-based) — matches the entry in `updatedLines`. */
  line: number;
  /** Fence body sottovoce would write. */
  expected: string[];
  /** Fence body currently in the docs; empty when no fence exists yet. */
  actual: string[];
}

export interface FileResult {
  file: string;
  updated: number;
  unchanged: number;
  /** Count of sotto directive lines seen, including malformed ones. */
  directives: number;
  /** Directive lines (1-based) whose fences were rewritten or inserted. */
  updatedLines: number[];
  /** Expected/current fence bodies for each entry in `updatedLines`. */
  drifts: FenceDrift[];
  problems: SnippetProblem[];
  /** Non-fatal advisories, e.g. an HTML comment directive in an .mdx file. */
  warnings: SnippetProblem[];
  /** New file content, if any fence changed. */
  content?: string;
}

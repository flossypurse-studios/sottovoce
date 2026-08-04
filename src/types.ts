/** A parsed `sotto` directive found in a docs file. */
export interface Directive {
  /** Key into the config's `sources` map. */
  source: string;
  /** Path of the snippet file, relative to the source root. */
  path: string;
  /** Optional `#region` name within the file. */
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

export interface FileResult {
  file: string;
  updated: number;
  unchanged: number;
  /** Count of sotto directive lines seen, including malformed ones. */
  directives: number;
  /** Directive lines (1-based) whose fences were rewritten or inserted. */
  updatedLines: number[];
  problems: SnippetProblem[];
  /** Non-fatal advisories, e.g. an HTML comment directive in an .mdx file. */
  warnings: SnippetProblem[];
  /** New file content, if any fence changed. */
  content?: string;
}

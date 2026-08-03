import fg from "fast-glob";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LoadedConfig } from "./config.js";
import { listDoc } from "./list.js";
import type { ListEntry, ListInvalid } from "./list.js";
import { mergeDoc } from "./merge.js";
import { readSourceFile, resolveSource, SourceError } from "./sources.js";
import type { Directive, FileResult, SnippetProblem } from "./types.js";

async function globDocs(loaded: LoadedConfig): Promise<string[]> {
  const files = await fg(loaded.config.docs, {
    cwd: loaded.dir,
    absolute: true,
    dot: false,
    onlyFiles: true,
  });
  files.sort();
  return files;
}

export interface ListSummary {
  entries: ListEntry[];
  invalid: ListInvalid[];
  /** Number of docs files scanned. */
  files: number;
}

/** Inventory every directive the docs globs can see. Parse-only — no source
 * resolution, no network. */
export async function runList(loaded: LoadedConfig): Promise<ListSummary> {
  const docFiles = await globDocs(loaded);
  const known = new Set(Object.keys(loaded.config.sources));
  const entries: ListEntry[] = [];
  const invalid: ListInvalid[] = [];
  for (const abs of docFiles) {
    const rel = path.relative(loaded.dir, abs);
    const result = listDoc(rel, readFileSync(abs, "utf8"), known);
    entries.push(...result.entries);
    invalid.push(...result.invalid);
  }
  return { entries, invalid, files: docFiles.length };
}

export interface SyncOptions {
  /** Report drift without writing (CI mode). */
  check?: boolean;
  /** Use cached repo clones without fetching. */
  offline?: boolean;
  cacheDir?: string;
}

export interface SyncSummary {
  files: FileResult[];
  updated: number;
  unchanged: number;
  /** Files whose content changed (written unless check mode). */
  changedFiles: string[];
  problems: SnippetProblem[];
  warnings: SnippetProblem[];
}

export async function runSync(
  loaded: LoadedConfig,
  opts: SyncOptions = {},
): Promise<SyncSummary> {
  const { config, dir } = loaded;

  const docFiles = await globDocs(loaded);

  // Sources resolve lazily so a config can list repos that this docs tree
  // doesn't reference yet without paying for a fetch.
  const sourceDirs = new Map<string, string>();
  const sourceErrors = new Map<string, string>();
  const resolve = (name: string): string => {
    const cached = sourceDirs.get(name);
    if (cached) return cached;
    const failed = sourceErrors.get(name);
    if (failed) throw new SourceError(failed);
    const spec = config.sources[name];
    if (!spec) throw new SourceError(`unknown source "${name}"`);
    try {
      const resolved = resolveSource(name, spec, {
        configDir: dir,
        offline: opts.offline,
        cacheDir: opts.cacheDir,
      });
      sourceDirs.set(name, resolved);
      return resolved;
    } catch (err) {
      sourceErrors.set(name, (err as Error).message);
      throw err;
    }
  };

  const readSnippet = (d: Directive): string =>
    readSourceFile(resolve(d.source), d.path);

  const files: FileResult[] = [];
  const changedFiles: string[] = [];
  for (const abs of docFiles) {
    const rel = path.relative(dir, abs);
    const result = mergeDoc(rel, readFileSync(abs, "utf8"), readSnippet);
    files.push(result);
    if (result.content !== undefined) {
      changedFiles.push(rel);
      if (!opts.check) {
        try {
          writeFileSync(abs, result.content);
        } catch (err) {
          // Keep going — one unwritable file must not abandon the rest.
          result.problems.push({
            file: rel,
            line: 0,
            message: `could not write file: ${(err as Error).message}`,
          });
        }
      }
    }
  }

  return {
    files,
    updated: files.reduce((n, f) => n + f.updated, 0),
    unchanged: files.reduce((n, f) => n + f.unchanged, 0),
    changedFiles,
    problems: files.flatMap((f) => f.problems),
    warnings: files.flatMap((f) => f.warnings),
  };
}

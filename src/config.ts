import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Config, SourceSpec } from "./types.js";

export class ConfigError extends Error {}

export const CONFIG_NAME = "sottovoce.json";

export interface LoadedConfig {
  config: Config;
  /** Absolute path of the config file. */
  file: string;
  /** Directory the config lives in — docs globs and local sources resolve here. */
  dir: string;
}

/** Find sottovoce.json in `start` or the nearest ancestor directory. */
export function findConfig(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    const candidate = path.join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(file: string): LoadedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new ConfigError(`cannot read ${file}: ${(err as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(`${file}: expected a JSON object`);
  }
  const obj = raw as Record<string, unknown>;

  const docs = obj.docs;
  if (
    !Array.isArray(docs) ||
    docs.length === 0 ||
    !docs.every((d) => typeof d === "string")
  ) {
    throw new ConfigError(`${file}: "docs" must be a non-empty array of globs`);
  }

  const sourcesRaw = obj.sources;
  if (
    typeof sourcesRaw !== "object" ||
    sourcesRaw === null ||
    Array.isArray(sourcesRaw)
  ) {
    throw new ConfigError(`${file}: "sources" must be an object`);
  }
  const sources: Record<string, SourceSpec> = {};
  for (const [name, spec] of Object.entries(sourcesRaw)) {
    if (typeof spec !== "object" || spec === null) {
      throw new ConfigError(`${file}: source "${name}" must be an object`);
    }
    const s = spec as Record<string, unknown>;
    const hasRepo = typeof s.repo === "string";
    const hasPath = typeof s.path === "string";
    if (hasRepo === hasPath) {
      throw new ConfigError(
        `${file}: source "${name}" needs exactly one of "repo" or "path"`,
      );
    }
    if (hasRepo) {
      if (s.ref !== undefined) {
        // The ref is handed to `git fetch` as an argument — refuse anything
        // that could be parsed as a flag.
        if (
          typeof s.ref !== "string" ||
          s.ref === "" ||
          s.ref.startsWith("-") ||
          /\s/.test(s.ref)
        ) {
          throw new ConfigError(
            `${file}: source "${name}": "ref" must be a branch, tag, or commit (no leading "-", no whitespace)`,
          );
        }
      }
      sources[name] = { repo: s.repo as string, ref: s.ref as string | undefined };
    } else {
      sources[name] = { path: s.path as string };
    }
  }

  return {
    config: { docs: docs as string[], sources },
    file,
    dir: path.dirname(file),
  };
}

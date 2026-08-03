import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { SourceSpec } from "./types.js";

export class SourceError extends Error {}

export interface ResolveOptions {
  /** Directory the config file lives in; local paths resolve against it. */
  configDir: string;
  /** Reuse cached clones without fetching (no network). */
  offline?: boolean;
  cacheDir?: string;
}

function defaultCacheDir(): string {
  const base =
    process.env.XDG_CACHE_HOME && process.env.XDG_CACHE_HOME.trim() !== ""
      ? process.env.XDG_CACHE_HOME
      : path.join(homedir(), ".cache");
  return path.join(base, "sottovoce");
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
}

/**
 * Resolve a source spec to a local directory.
 *
 * Repo sources are shallow-fetched into a per-repo+ref cache. The
 * init/fetch/checkout dance (instead of `clone --branch`) lets `ref` be a
 * branch, a tag, or a full commit SHA.
 */
export function resolveSource(
  name: string,
  spec: SourceSpec,
  opts: ResolveOptions,
): string {
  if ("path" in spec) {
    const dir = path.resolve(opts.configDir, spec.path);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new SourceError(`source "${name}": directory not found: ${dir}`);
    }
    return dir;
  }

  if (!/^[\w.-]+\/[\w.-]+$/.test(spec.repo)) {
    throw new SourceError(
      `source "${name}": repo must be "owner/name", got "${spec.repo}"`,
    );
  }
  const ref = spec.ref ?? "main";
  const cacheRoot = opts.cacheDir ?? defaultCacheDir();
  // encodeURIComponent is injective — distinct refs can never collide into
  // the same cache directory.
  const dir = path.join(
    cacheRoot,
    `${spec.repo.replace("/", "__")}@${encodeURIComponent(ref)}`,
  );

  if (opts.offline) {
    if (!existsSync(path.join(dir, ".git"))) {
      throw new SourceError(
        `source "${name}": no cached copy of ${spec.repo}@${ref} (run once without --offline)`,
      );
    }
    return dir;
  }

  const url = `https://github.com/${spec.repo}.git`;
  const fetchError = (err: unknown): SourceError => {
    const detail =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : String(err);
    return new SourceError(
      `source "${name}": failed to fetch ${spec.repo}@${ref}: ${detail}`,
    );
  };

  if (existsSync(path.join(dir, ".git"))) {
    // Updating an existing cache entry in place is safe: a failed fetch
    // leaves the previous checkout intact.
    try {
      git(dir, "remote", "set-url", "origin", url);
      git(dir, "fetch", "-q", "--depth", "1", "origin", ref);
      git(dir, "checkout", "-q", "--detach", "FETCH_HEAD");
    } catch (err) {
      throw fetchError(err);
    }
    return dir;
  }

  // First fetch: work in a temp directory and rename into the cache key only
  // on success, so a failed fetch never leaves a residue entry behind.
  mkdirSync(cacheRoot, { recursive: true });
  const tmp = mkdtempSync(path.join(cacheRoot, ".tmp-"));
  try {
    git(tmp, "init", "-q");
    git(tmp, "remote", "add", "origin", url);
    git(tmp, "fetch", "-q", "--depth", "1", "origin", ref);
    git(tmp, "checkout", "-q", "--detach", "FETCH_HEAD");
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw fetchError(err);
  }
  try {
    renameSync(tmp, dir);
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    // A concurrent run may have won the rename — its cache entry is as good.
    if (!existsSync(path.join(dir, ".git"))) throw err;
  }
  return dir;
}

/** Read a snippet file from a resolved source, refusing paths that escape it. */
export function readSourceFile(sourceDir: string, relPath: string): string {
  const abs = path.resolve(sourceDir, relPath);
  const rel = path.relative(sourceDir, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new SourceError(`path escapes source root: ${relPath}`);
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new SourceError(`file not found: ${relPath}`);
  }
  // The lexical check above doesn't follow symlinks — resolve both sides so a
  // link inside the source root can't pull in files from outside it.
  const realRoot = realpathSync(sourceDir);
  const realAbs = realpathSync(abs);
  const realRel = path.relative(realRoot, realAbs);
  if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
    throw new SourceError(`path escapes source root via symlink: ${relPath}`);
  }
  return readFileSync(realAbs, "utf8");
}

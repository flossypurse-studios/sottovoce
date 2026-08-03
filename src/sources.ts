import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
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
  const dir = path.join(
    cacheRoot,
    `${spec.repo.replace("/", "__")}@${ref.replace(/[^\w.-]/g, "_")}`,
  );

  if (opts.offline) {
    if (!existsSync(path.join(dir, ".git"))) {
      throw new SourceError(
        `source "${name}": no cached copy of ${spec.repo}@${ref} (run once without --offline)`,
      );
    }
    return dir;
  }

  try {
    if (!existsSync(path.join(dir, ".git"))) {
      mkdirSync(dir, { recursive: true });
      git(dir, "init", "-q");
      git(dir, "remote", "add", "origin", `https://github.com/${spec.repo}.git`);
    } else {
      git(dir, "remote", "set-url", "origin", `https://github.com/${spec.repo}.git`);
    }
    git(dir, "fetch", "-q", "--depth", "1", "origin", ref);
    git(dir, "checkout", "-q", "--detach", "FETCH_HEAD");
  } catch (err) {
    const detail =
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : String(err);
    throw new SourceError(
      `source "${name}": failed to fetch ${spec.repo}@${ref}: ${detail}`,
    );
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
  return readFileSync(abs, "utf8");
}

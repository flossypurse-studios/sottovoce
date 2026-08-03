import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveSource, SourceError } from "../src/sources.js";

// Put a scripted `git` at the front of PATH so fetch outcomes are hermetic —
// no network, no dependence on real repos existing.
function withFakeGit<T>(script: string, fn: () => T): T {
  const bin = mkdtempSync(path.join(tmpdir(), "sottovoce-git-"));
  const gitPath = path.join(bin, "git");
  writeFileSync(gitPath, `#!/bin/sh\n${script}\n`);
  chmodSync(gitPath, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${oldPath ?? ""}`;
  try {
    return fn();
  } finally {
    process.env.PATH = oldPath;
  }
}

function makeCache(): string {
  const root = mkdtempSync(path.join(tmpdir(), "sottovoce-cache-"));
  return path.join(root, "cache");
}

test("a failed fetch leaves no residue in the cache", () => {
  const cacheDir = makeCache();
  withFakeGit('echo "fatal: repository not found" >&2; exit 128', () => {
    assert.throws(
      () =>
        resolveSource(
          "ex",
          { repo: "no-such-owner/no-such-repo", ref: "main" },
          { configDir: tmpdir(), cacheDir },
        ),
      (err: unknown) =>
        err instanceof SourceError && /failed to fetch/.test(err.message),
    );
  });
  assert.deepEqual(readdirSync(cacheDir), []);
});

test("a successful fetch lands under the cache key with no temp leftovers", () => {
  const cacheDir = makeCache();
  const dir = withFakeGit('[ "$1" = init ] && mkdir -p .git; exit 0', () =>
    resolveSource(
      "ex",
      { repo: "some-owner/some-repo", ref: "v1.0.0" },
      { configDir: tmpdir(), cacheDir },
    ),
  );
  assert.equal(dir, path.join(cacheDir, "some-owner__some-repo@v1.0.0"));
  assert.deepEqual(readdirSync(cacheDir), ["some-owner__some-repo@v1.0.0"]);
});

test("a failed refresh of an existing cache entry keeps the old checkout", () => {
  const cacheDir = makeCache();
  const dir = path.join(cacheDir, "some-owner__some-repo@main");
  mkdirSync(path.join(dir, ".git"), { recursive: true });
  writeFileSync(path.join(dir, "kept.txt"), "previous checkout\n");
  withFakeGit('[ "$1" = "remote" ] && exit 0; exit 128', () => {
    assert.throws(
      () =>
        resolveSource(
          "ex",
          { repo: "some-owner/some-repo" },
          { configDir: tmpdir(), cacheDir },
        ),
      /failed to fetch/,
    );
  });
  assert.deepEqual(readdirSync(dir).sort(), [".git", "kept.txt"]);
});

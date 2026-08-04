import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");
const CLI = path.join(ROOT, "src", "cli.ts");

function runCli(cwd: string, ...args: string[]) {
  const r = spawnSync(TSX, [CLI, ...args], { cwd, encoding: "utf8" });
  return { code: r.status ?? 0, stdout: r.stdout, stderr: r.stderr };
}

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "sottovoce-cli-"));
  const examples = path.join(root, "examples");
  const docsRepo = path.join(root, "docs-repo");
  mkdirSync(path.join(examples, "src"), { recursive: true });
  mkdirSync(path.join(docsRepo, "docs"), { recursive: true });

  writeFileSync(
    path.join(examples, "src", "hello.ts"),
    ["// #region hello", "export const hi = 1;", "// #endregion", ""].join("\n"),
  );
  writeFileSync(
    path.join(docsRepo, "sottovoce.json"),
    JSON.stringify({
      docs: ["docs/**/*.{md,mdx}"],
      sources: { ts: { path: "../examples" } },
    }),
  );
  return { root, docsRepo };
}

const DIRECTIVE_DOC = [
  "<!-- sotto ts:src/hello.ts#hello -->",
  "```ts",
  "```",
  "",
  "<!-- sotto ts:src/hello.ts -->",
  "```ts",
  "```",
  "",
].join("\n");

test("check and sync summaries count snippets and files separately", () => {
  const { docsRepo } = makeFixture();
  writeFileSync(path.join(docsRepo, "docs", "guide.md"), DIRECTIVE_DOC);
  writeFileSync(path.join(docsRepo, "docs", "plain.md"), "# No snippets here\n");

  const checked = runCli(docsRepo, "check");
  assert.equal(checked.code, 1);
  assert.match(checked.stdout, /checked 2 snippets across 2 files: 0 in sync, 2 stale/);

  const synced = runCli(docsRepo, "sync");
  assert.equal(synced.code, 0);
  assert.match(
    synced.stdout,
    /synced 2 snippets across 2 files: 2 updated, 0 unchanged \(1 file written\)/,
  );

  const again = runCli(docsRepo, "check");
  assert.equal(again.code, 0);
  assert.match(again.stdout, /checked 2 snippets across 2 files: 2 in sync, 0 stale/);
});

test("summary uses singular forms for one snippet in one file", () => {
  const { docsRepo } = makeFixture();
  writeFileSync(
    path.join(docsRepo, "docs", "only.md"),
    ["<!-- sotto ts:src/hello.ts#hello -->", "```ts", "```", ""].join("\n"),
  );
  const synced = runCli(docsRepo, "sync");
  assert.match(
    synced.stdout,
    /synced 1 snippet across 1 file: 1 updated, 0 unchanged \(1 file written\)/,
  );
});

test("a run that finds no directives says so", () => {
  const { docsRepo } = makeFixture();
  writeFileSync(path.join(docsRepo, "docs", "plain.md"), "# No snippets here\n");
  const r = runCli(docsRepo, "sync");
  assert.equal(r.code, 0);
  assert.match(
    r.stderr,
    /no sotto directives found \(scanned 1 file matching docs\/\*\*\/\*\.\{md,mdx\}\)/,
  );
});

test("docs globs matching no files is reported with the globs", () => {
  const { docsRepo } = makeFixture();
  const r = runCli(docsRepo, "check");
  assert.equal(r.code, 0);
  assert.match(r.stderr, /no files matched docs globs \(docs\/\*\*\/\*\.\{md,mdx\}\)/);
});

test("check --diff prints a subordinate diff under each drift line", () => {
  const { docsRepo } = makeFixture();
  writeFileSync(
    path.join(docsRepo, "docs", "guide.md"),
    [
      "<!-- sotto ts:src/hello.ts#hello -->",
      "```ts",
      "export const hi = 2;",
      "```",
      "",
    ].join("\n"),
  );
  const r = runCli(docsRepo, "check", "--diff");
  assert.equal(r.code, 1);
  assert.match(
    r.stdout,
    /drift: docs\/guide\.md:1\n  - export const hi = 2;\n  \+ export const hi = 1;\n/,
  );

  // Default check output carries no diff lines.
  const plain = runCli(docsRepo, "check");
  assert.ok(!plain.stdout.includes("  - "));
  assert.ok(!plain.stdout.includes("  + "));

  const bad = runCli(docsRepo, "sync", "--diff");
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--diff is only valid with the check command/);
});

test("list prints a grouped inventory and always exits 0", () => {
  const { docsRepo } = makeFixture();
  writeFileSync(
    path.join(docsRepo, "docs", "guide.md"),
    [
      "<!-- sotto ts:src/hello.ts#hello -->",
      "```ts",
      "```",
      "",
      "<!-- sotto rust:src/main.rs -->",
      "",
      "<!-- sotto nonsense -->",
      "",
    ].join("\n"),
  );
  const r = runCli(docsRepo, "list");
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^docs\/guide\.md\n/);
  assert.match(r.stdout, /  1: ts:src\/hello\.ts#hello\n/);
  assert.match(r.stdout, /  5: rust:src\/main\.rs \[UNKNOWN SOURCE\] \[NO FENCE\]\n/);
  assert.match(r.stdout, /  7: \[INVALID: /);

  const j = runCli(docsRepo, "list", "--json");
  assert.equal(j.code, 0);
  const parsed = JSON.parse(j.stdout) as Array<Record<string, unknown>>;
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0]!.sourceKnown, true);
  assert.equal(parsed[0]!.hasFence, true);
  assert.equal(parsed[1]!.sourceKnown, false);
});

test("--json outside list is rejected", () => {
  const { docsRepo } = makeFixture();
  const r = runCli(docsRepo, "check", "--json");
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--json is only valid with the list command/);
});

test("HTML comment directives in .mdx files warn on stderr", () => {
  const { docsRepo } = makeFixture();
  writeFileSync(
    path.join(docsRepo, "docs", "page.mdx"),
    ["<!-- sotto ts:src/hello.ts#hello -->", "```ts", "```", ""].join("\n"),
  );
  const r = runCli(docsRepo, "sync");
  assert.equal(r.code, 0);
  assert.match(
    r.stderr,
    /warning: docs\/page\.mdx:1: HTML comment directive in \.mdx — use \{\/\* sotto \.\.\. \*\/\} \(MDX fails on <!-- -->\)/,
  );
  assert.match(r.stdout, /synced 1 snippet across 1 file/);
});

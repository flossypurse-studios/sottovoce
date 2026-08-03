import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadConfig, findConfig } from "../src/config.js";
import { runSync } from "../src/run.js";

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "sottovoce-"));
  const examples = path.join(root, "examples");
  const docsRepo = path.join(root, "docs-repo");
  mkdirSync(path.join(examples, "src"), { recursive: true });
  mkdirSync(path.join(docsRepo, "docs"), { recursive: true });

  writeFileSync(
    path.join(examples, "src", "retry.ts"),
    [
      "import { Resonate } from '@resonatehq/sdk';",
      "",
      "// #region retry",
      "const result = await ctx.run(flakyCall, { retries: 3 });",
      "// #endregion",
      "",
    ].join("\n"),
  );

  writeFileSync(
    path.join(docsRepo, "sottovoce.json"),
    JSON.stringify({
      docs: ["docs/**/*.md"],
      sources: { ts: { path: "../examples" } },
    }),
  );

  writeFileSync(
    path.join(docsRepo, "docs", "guide.md"),
    [
      "# Guide",
      "",
      "<!-- sotto ts:src/retry.ts#retry -->",
      "```ts",
      "```",
      "",
      "<!-- sotto ts:src/retry.ts -->",
      "```ts",
      "```",
      "",
    ].join("\n"),
  );

  return { root, docsRepo };
}

test("syncs a docs tree from a local source", async () => {
  const { docsRepo } = makeFixture();
  const loaded = loadConfig(path.join(docsRepo, "sottovoce.json"));

  const summary = await runSync(loaded);
  assert.deepEqual(summary.problems, []);
  assert.equal(summary.updated, 2);
  assert.deepEqual(summary.changedFiles, [path.join("docs", "guide.md")]);

  const guide = readFileSync(path.join(docsRepo, "docs", "guide.md"), "utf8");
  assert.ok(guide.includes("const result = await ctx.run(flakyCall, { retries: 3 });"));
  // Whole-file snippet keeps imports but sheds the region plumbing.
  assert.ok(guide.includes("import { Resonate } from '@resonatehq/sdk';"));
  assert.ok(!guide.includes("#region"));

  // Second run: everything in sync, nothing written.
  const again = await runSync(loaded);
  assert.equal(again.updated, 0);
  assert.equal(again.unchanged, 2);
  assert.deepEqual(again.changedFiles, []);
});

test("check mode reports drift without writing", async () => {
  const { docsRepo } = makeFixture();
  const loaded = loadConfig(path.join(docsRepo, "sottovoce.json"));
  const before = readFileSync(path.join(docsRepo, "docs", "guide.md"), "utf8");

  const summary = await runSync(loaded, { check: true });
  assert.equal(summary.changedFiles.length, 1);
  assert.equal(readFileSync(path.join(docsRepo, "docs", "guide.md"), "utf8"), before);
});

test("unknown sources surface as problems, not crashes", async () => {
  const { docsRepo } = makeFixture();
  writeFileSync(
    path.join(docsRepo, "docs", "bad.md"),
    ["<!-- sotto rust:src/main.rs -->", "```rust", "keep", "```", ""].join("\n"),
  );
  const loaded = loadConfig(path.join(docsRepo, "sottovoce.json"));
  const summary = await runSync(loaded, { check: true });
  assert.equal(summary.problems.length, 1);
  assert.match(summary.problems[0]!.message, /unknown source "rust"/);
});

test("findConfig walks up from a nested directory", () => {
  const { docsRepo } = makeFixture();
  const found = findConfig(path.join(docsRepo, "docs"));
  assert.equal(found, path.join(docsRepo, "sottovoce.json"));
});

test("rejects refs that could be parsed as git flags", () => {
  const { docsRepo } = makeFixture();
  writeFileSync(
    path.join(docsRepo, "sottovoce.json"),
    JSON.stringify({
      docs: ["docs/**/*.md"],
      sources: { ts: { repo: "org/repo", ref: "--upload-pack=evil" } },
    }),
  );
  assert.throws(
    () => loadConfig(path.join(docsRepo, "sottovoce.json")),
    /"ref" must be a branch, tag, or commit/,
  );
});

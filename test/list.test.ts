import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { listDoc } from "../src/list.js";
import { runList } from "../src/run.js";

const KNOWN = new Set(["ts"]);

test("inventories directives with source and fence status", () => {
  const doc = [
    "# Guide",
    "",
    "<!-- sotto ts:src/hello.ts#hello -->",
    "```ts",
    "old",
    "```",
    "",
    "<!-- sotto rust:src/main.rs -->",
    "```rust",
    "```",
    "",
    "<!-- sotto ts:src/hello.ts lines=1-5 lang=ts -->",
    "",
    "no fence follows",
  ].join("\n");
  const { entries, invalid } = listDoc("docs/guide.md", doc, KNOWN);
  assert.deepEqual(invalid, []);
  assert.deepEqual(entries, [
    {
      file: "docs/guide.md",
      line: 3,
      source: "ts",
      path: "src/hello.ts",
      region: "hello",
      lines: undefined,
      lang: undefined,
      sourceKnown: true,
      hasFence: true,
    },
    {
      file: "docs/guide.md",
      line: 8,
      source: "rust",
      path: "src/main.rs",
      region: undefined,
      lines: undefined,
      lang: undefined,
      sourceKnown: false,
      hasFence: true,
    },
    {
      file: "docs/guide.md",
      line: 12,
      source: "ts",
      path: "src/hello.ts",
      region: undefined,
      lines: { start: 1, end: 5 },
      lang: "ts",
      sourceKnown: true,
      hasFence: false,
    },
  ]);
});

test("ignores literal directive examples inside non-owned fences", () => {
  const doc = [
    "```markdown",
    "<!-- sotto ts:src/hello.ts#hello -->",
    "```",
    "",
    "{/* sotto ts:src/hello.ts#real */}",
    "```ts",
    "```",
    "",
  ].join("\n");
  const { entries } = listDoc("docs/guide.mdx", doc, KNOWN);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.region, "real");
  assert.equal(entries[0]!.line, 5);
});

test("does not list directives inside a fence owned by an earlier directive", () => {
  const doc = [
    "<!-- sotto ts:src/example.md -->",
    "```markdown",
    "<!-- sotto ts:src/hello.ts#hello -->",
    "```",
    "",
  ].join("\n");
  const { entries } = listDoc("docs/guide.md", doc, KNOWN);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.path, "src/example.md");
});

test("reports unparseable directive lines as invalid, not fatal", () => {
  const doc = ["<!-- sotto nonsense -->", "", "<!-- sotto ts:src/ok.ts -->"].join("\n");
  const { entries, invalid } = listDoc("docs/guide.md", doc, KNOWN);
  assert.equal(entries.length, 1);
  assert.equal(invalid.length, 1);
  assert.equal(invalid[0]!.line, 1);
  assert.match(invalid[0]!.error, /expected "<source>:<path>/);
});

test("runList inventories a docs tree without resolving sources", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sottovoce-list-"));
  mkdirSync(path.join(root, "docs"), { recursive: true });
  writeFileSync(
    path.join(root, "sottovoce.json"),
    JSON.stringify({
      docs: ["docs/**/*.md"],
      // A repo source that would fail to fetch — list must never resolve it.
      sources: { ts: { repo: "no-such-owner/no-such-repo" } },
    }),
  );
  writeFileSync(
    path.join(root, "docs", "a.md"),
    ["<!-- sotto ts:src/hello.ts#hello -->", "```ts", "```", ""].join("\n"),
  );
  writeFileSync(
    path.join(root, "docs", "b.md"),
    ["<!-- sotto other:src/x.ts -->"].join("\n"),
  );
  const summary = await runList(loadConfig(path.join(root, "sottovoce.json")));
  assert.equal(summary.files, 2);
  assert.equal(summary.entries.length, 2);
  const [a, b] = summary.entries;
  assert.equal(a!.file, path.join("docs", "a.md"));
  assert.equal(a!.sourceKnown, true);
  assert.equal(a!.hasFence, true);
  assert.equal(b!.sourceKnown, false);
  assert.equal(b!.hasFence, false);
});

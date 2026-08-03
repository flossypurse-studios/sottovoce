import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeDoc } from "../src/merge.js";
import type { Directive } from "../src/types.js";

const SOURCE = [
  "// #region hello",
  "export function hello() {",
  '  return "hi";',
  "}",
  "// #endregion",
].join("\n");

const reader = (d: Directive) => {
  if (d.path === "hello.ts") return SOURCE;
  throw new Error(`file not found: ${d.path}`);
};

test("fills an empty fence after a directive", () => {
  const doc = [
    "# Title",
    "",
    "<!-- sotto ts:hello.ts#hello -->",
    "```ts",
    "```",
    "",
  ].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.problems, []);
  assert.equal(
    result.content,
    [
      "# Title",
      "",
      "<!-- sotto ts:hello.ts#hello -->",
      "```ts",
      "export function hello() {",
      '  return "hi";',
      "}",
      "```",
      "",
    ].join("\n"),
  );
});

test("inserts a fence when none exists yet", () => {
  const doc = ["<!-- sotto ts:hello.ts#hello -->", "", "next paragraph"].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.equal(result.updated, 1);
  assert.ok(result.content?.includes("```ts\nexport function hello()"));
});

test("is idempotent", () => {
  const doc = ["<!-- sotto ts:hello.ts#hello -->", "```ts", "stale", "```", ""].join("\n");
  const first = mergeDoc("doc.md", doc, reader);
  assert.ok(first.content);
  const second = mergeDoc("doc.md", first.content!, reader);
  assert.equal(second.content, undefined);
  assert.equal(second.unchanged, 1);
  assert.equal(second.updated, 0);
});

test("preserves an author's richer info string", () => {
  const doc = [
    "<!-- sotto ts:hello.ts#hello -->",
    '```ts {2} title="hello.ts"',
    "```",
    "",
  ].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.ok(result.content?.includes('```ts {2} title="hello.ts"'));
});

test("indents snippets inside lists", () => {
  const doc = [
    "1. Do the thing:",
    "",
    "   <!-- sotto ts:hello.ts#hello -->",
    "   ```ts",
    "   ```",
    "",
  ].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.ok(result.content?.includes("   export function hello() {"));
  assert.ok(result.content?.includes('     return "hi";'));
});

test("widens fences around snippets containing backticks", () => {
  const mdSource = "# readme\n\n```sh\nnpm i\n```\n";
  const result = mergeDoc(
    "doc.md",
    ["<!-- sotto docs:readme.md -->", "```markdown", "```", ""].join("\n"),
    () => mdSource,
  );
  assert.ok(result.content?.includes("````markdown"));
});

test("reports problems without touching the fence", () => {
  const doc = ["<!-- sotto ts:missing.ts -->", "```ts", "keep me", "```", ""].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.equal(result.content, undefined);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0]!.message, /file not found/);
});

test("reports missing regions and unclosed fences", () => {
  const missingRegion = mergeDoc(
    "doc.md",
    ["<!-- sotto ts:hello.ts#nope -->", "```ts", "```", ""].join("\n"),
    reader,
  );
  assert.match(missingRegion.problems[0]!.message, /region "nope" not found/);

  const unclosed = mergeDoc(
    "doc.md",
    ["<!-- sotto ts:hello.ts#hello -->", "```ts", "no closing fence"].join("\n"),
    reader,
  );
  assert.match(unclosed.problems[0]!.message, /unclosed code fence/);
  assert.equal(unclosed.content, undefined);
});

test("processes multiple directives in one file", () => {
  const doc = [
    "<!-- sotto ts:hello.ts#hello -->",
    "```ts",
    "```",
    "",
    "{/* sotto ts:hello.ts lines=2-4 */}",
    "```ts",
    "```",
    "",
  ].join("\n");
  const result = mergeDoc("doc.mdx", doc, reader);
  assert.equal(result.updated, 2);
  assert.deepEqual(result.problems, []);
  assert.ok(result.content?.includes('  return "hi";'));
});

test("ignores literal directive examples inside code fences", () => {
  const doc = [
    "Show the syntax:",
    "",
    "```markdown",
    "<!-- sotto ts:hello.ts#hello -->",
    "```",
    "",
    "<!-- sotto ts:hello.ts#hello -->",
    "```ts",
    "```",
    "",
  ].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.problems, []);
  // The fenced example is untouched; only the real directive's fence filled.
  assert.ok(result.content?.includes("```markdown\n<!-- sotto ts:hello.ts#hello -->\n```"));
});

test("handles CRLF docs and keeps them CRLF", () => {
  const doc = "# Title\r\n\r\n<!-- sotto ts:hello.ts#hello -->\r\n```ts\r\nstale\r\n```\r\n";
  const first = mergeDoc("doc.md", doc, reader);
  assert.equal(first.updated, 1);
  assert.ok(first.content?.includes('export function hello() {\r\n  return "hi";\r\n}'));
  // No doubled fences, and a second pass is a no-op.
  assert.equal((first.content?.match(/```/g) ?? []).length, 2);
  const second = mergeDoc("doc.md", first.content!, reader);
  assert.equal(second.content, undefined);
  assert.equal(second.unchanged, 1);
});

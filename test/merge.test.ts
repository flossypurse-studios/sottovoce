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

test("empty snippet reports a problem and preserves the fence", () => {
  const cases = [
    ["empty.ts", ""],
    ["markers.ts", "// #region empty\n// #endregion\n"],
  ] as const;
  for (const [file, source] of cases) {
    const doc = [`<!-- sotto ts:${file} -->`, "```ts", "keep me", "```", ""].join("\n");
    const result = mergeDoc("doc.md", doc, () => source);
    assert.equal(result.content, undefined, file);
    assert.equal(result.updated, 0, file);
    assert.match(result.problems[0]!.message, /snippet is empty/);
  }
});

test("a fence missing its close does not swallow the next directive", () => {
  const doc = [
    "<!-- sotto ts:hello.ts#hello -->",
    "```ts",
    "stale foo",
    "",
    "<!-- sotto ts:hello.ts#hello -->",
    "```ts",
    "stale bar",
    "```",
    "",
  ].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.match(result.problems[0]!.message, /unclosed code fence/);
  // Everything after the broken open is fence content per CommonMark — the
  // whole span is preserved byte-for-byte and the problem fails the run.
  assert.equal(result.content, undefined);
  assert.equal(result.updated, 0);
});

test("lang= overrides the fence language token but keeps the metadata tail", () => {
  const doc = [
    "<!-- sotto ts:hello.ts#hello lang=typescript -->",
    '```ts {2} title="hello.ts"',
    "```",
    "",
  ].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.ok(result.content?.includes('```typescript {2} title="hello.ts"'));
});

test("handles six-figure-line snippets without a stack overflow", () => {
  const big = Array.from({ length: 150000 }, (_, i) => `const x${i} = ${i};`).join("\n");
  const doc = ["<!-- sotto ts:big.ts -->", "```ts", "```", ""].join("\n");
  const result = mergeDoc("doc.md", doc, () => big);
  assert.equal(result.updated, 1);
  assert.ok(result.content!.length > big.length);
});

test("records directive lines for rewritten fences", () => {
  const doc = [
    "# Title",
    "",
    "<!-- sotto ts:hello.ts#hello -->",
    "```ts",
    "stale",
    "```",
    "",
  ].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.deepEqual(result.updatedLines, [3]);
});

test("an existing fence's language token is preserved, not re-inferred", () => {
  // hello.ts would infer `ts` — the author's `typescript` token must survive.
  const doc = ["<!-- sotto ts:hello.ts#hello -->", "```typescript", "stale", "```", ""].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.equal(result.updated, 1);
  assert.ok(result.content?.includes("```typescript\nexport function hello()"));
});

test("warns on an HTML comment directive in an .mdx file, syncing it anyway", () => {
  const doc = ["<!-- sotto ts:hello.ts#hello -->", "```ts", "```", ""].join("\n");
  const result = mergeDoc("doc.mdx", doc, reader);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]!.line, 1);
  assert.match(result.warnings[0]!.message, /HTML comment directive in \.mdx/);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.problems, []);
});

test("no .mdx warning for MDX-form directives or for .md files", () => {
  const mdx = mergeDoc(
    "doc.mdx",
    ["{/* sotto ts:hello.ts#hello */}", "```ts", "```", ""].join("\n"),
    reader,
  );
  assert.deepEqual(mdx.warnings, []);
  const md = mergeDoc(
    "doc.md",
    ["<!-- sotto ts:hello.ts#hello -->", "```ts", "```", ""].join("\n"),
    reader,
  );
  assert.deepEqual(md.warnings, []);
});

test("counts directive lines, including malformed ones", () => {
  const doc = [
    "<!-- sotto ts:hello.ts#hello -->",
    "```ts",
    "```",
    "",
    "<!-- sotto nonsense -->",
    "no directives in plain text",
  ].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.equal(result.directives, 2);
  assert.equal(result.problems.length, 1);
});

test("directives with trailing spaces inside the comment still parse", () => {
  const doc = ["<!-- sotto ts:hello.ts#hello    -->", "```ts", "```", ""].join("\n");
  const result = mergeDoc("doc.md", doc, reader);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.problems, []);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { matchDirective, parseDirectiveBody } from "../src/directive.js";

test("matches html comment directives", () => {
  const m = matchDirective("<!-- sotto ts:src/app.ts#checkout -->", 1);
  assert.ok(m);
  assert.equal(m.directive.source, "ts");
  assert.equal(m.directive.path, "src/app.ts");
  assert.equal(m.directive.region, "checkout");
});

test("matches mdx comment directives and preserves indent", () => {
  const m = matchDirective("  {/* sotto py:worker.py */}", 3);
  assert.ok(m);
  assert.equal(m.indent, "  ");
  assert.equal(m.directive.source, "py");
  assert.equal(m.directive.path, "worker.py");
  assert.equal(m.directive.region, undefined);
});

test("ignores ordinary comments and code", () => {
  assert.equal(matchDirective("<!-- a normal comment -->", 1), null);
  assert.equal(matchDirective("const sotto = 1;", 1), null);
  assert.equal(matchDirective("<!-- sottovoce ts:x.ts -->", 1), null);
});

test("parses options", () => {
  const d = parseDirectiveBody("go:main.go lines=4-9 lang=golang", 1);
  assert.deepEqual(d.lines, { start: 4, end: 9 });
  assert.equal(d.lang, "golang");
  const single = parseDirectiveBody("go:main.go lines=7", 1);
  assert.deepEqual(single.lines, { start: 7, end: 7 });
});

test("rejects malformed directives", () => {
  assert.throws(() => parseDirectiveBody("no-colon-here", 1));
  assert.throws(() => parseDirectiveBody("ts:", 1));
  assert.throws(() => parseDirectiveBody(":path.ts", 1));
  assert.throws(() => parseDirectiveBody("ts:app.ts#", 1));
  assert.throws(() => parseDirectiveBody("ts:#region", 1));
  assert.throws(() => parseDirectiveBody("ts:app.ts lines=9-4", 1));
  assert.throws(() => parseDirectiveBody("ts:app.ts wat=1", 1));
});

test("rejects lines= combined with a region selector", () => {
  assert.throws(
    () => parseDirectiveBody("ts:app.ts#setup lines=2-4", 1),
    /cannot be combined/,
  );
});

test("space in a region name points at the real constraint", () => {
  assert.throws(
    () => parseDirectiveBody("ts:app.ts#my region", 1),
    /cannot contain spaces/,
  );
});

test("malformed directive with huge trailing spaces fails fast", () => {
  const line = "<!-- sotto ts:x " + " ".repeat(100000);
  const start = process.hrtime.bigint();
  assert.equal(matchDirective(line, 1), null);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 100, `directive regex took ${ms}ms`);
});

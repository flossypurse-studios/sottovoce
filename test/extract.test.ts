import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractLines,
  extractRegion,
  inferLang,
  tidy,
} from "../src/extract.js";

const TS = [
  "import { thing } from 'lib';",
  "",
  "// #region checkout",
  "export async function checkout(cart: Cart) {",
  "  // #region total",
  "  const total = sum(cart.items);",
  "  // #endregion",
  "  return pay(total);",
  "}",
  "// #endregion",
  "",
  "export function other() {}",
].join("\n");

test("extracts a named region", () => {
  const lines = tidy(extractRegion(TS, "checkout"));
  assert.deepEqual(lines, [
    "export async function checkout(cart: Cart) {",
    "  const total = sum(cart.items);",
    "  return pay(total);",
    "}",
  ]);
});

test("extracts a nested region and dedents it", () => {
  const lines = tidy(extractRegion(TS, "total"));
  assert.deepEqual(lines, ["const total = sum(cart.items);"]);
});

test("supports other comment leaders", () => {
  const py = ["# #region job", "def run():", "    pass", "# #endregion"].join("\n");
  assert.deepEqual(tidy(extractRegion(py, "job")), ["def run():", "    pass"]);

  const html = ["<!-- #region hero -->", "<h1>Hi</h1>", "<!-- #endregion -->"].join("\n");
  assert.deepEqual(tidy(extractRegion(html, "hero")), ["<h1>Hi</h1>"]);

  const sql = ["-- #region query", "select 1;", "-- #endregion"].join("\n");
  assert.deepEqual(tidy(extractRegion(sql, "query")), ["select 1;"]);
});

test("errors on missing or unclosed regions", () => {
  assert.throws(() => extractRegion(TS, "nope"), /not found/);
  assert.throws(
    () => extractRegion("// #region open\ncode();", "open"),
    /never closed/,
  );
});

test("region names must match exactly", () => {
  assert.throws(() => extractRegion(TS, "check"), /not found/);
});

test("extracts line ranges", () => {
  assert.deepEqual(extractLines("a\nb\nc\nd", { start: 2, end: 3 }), ["b", "c"]);
  assert.throws(() => extractLines("a\nb", { start: 1, end: 5 }), /out of range/);
});

test("tidy strips blank edges and trailing whitespace", () => {
  assert.deepEqual(tidy(["", "  a();  ", "", "  b();", ""]), ["a();", "", "b();"]);
});

test("infers fence language from extension", () => {
  assert.equal(inferLang("src/app.ts"), "ts");
  assert.equal(inferLang("worker.py"), "python");
  assert.equal(inferLang("main.rs"), "rust");
  assert.equal(inferLang("Dockerfile"), "dockerfile");
  assert.equal(inferLang("noext"), "");
});

test("trailing newline does not create a phantom extractable line", () => {
  assert.throws(
    () => extractLines("a\nb\nc\n", { start: 4, end: 4 }),
    /file has 3 lines/,
  );
  assert.deepEqual(extractLines("a\nb\nc\n", { start: 3, end: 3 }), ["c"]);
  assert.deepEqual(extractLines("a\nb\nc", { start: 3, end: 3 }), ["c"]);
});

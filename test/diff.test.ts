import assert from "node:assert/strict";
import { test } from "node:test";
import { diffLines } from "../src/diff.js";
import type { DiffOp } from "../src/diff.js";

// Any valid diff must reconstruct both inputs exactly.
function assertReconstructs(a: string[], b: string[], ops: DiffOp[]): void {
  assert.deepEqual(
    ops.filter((o) => o.kind !== "+").map((o) => o.text),
    a,
  );
  assert.deepEqual(
    ops.filter((o) => o.kind !== "-").map((o) => o.text),
    b,
  );
}

test("equal inputs produce only context lines", () => {
  const lines = ["a", "b", "c"];
  const ops = diffLines(lines, lines);
  assert.deepEqual(
    ops,
    lines.map((text) => ({ kind: " ", text })),
  );
});

test("both empty produces an empty diff", () => {
  assert.deepEqual(diffLines([], []), []);
});

test("pure insertion and pure deletion", () => {
  const insert = diffLines([], ["a", "b"]);
  assert.deepEqual(insert, [
    { kind: "+", text: "a" },
    { kind: "+", text: "b" },
  ]);
  const remove = diffLines(["a", "b"], []);
  assert.deepEqual(remove, [
    { kind: "-", text: "a" },
    { kind: "-", text: "b" },
  ]);
});

test("a one-line change in context", () => {
  const a = ["const x = 1;", "const y = 2;", "return x + y;"];
  const b = ["const x = 1;", "const y = 3;", "return x + y;"];
  const ops = diffLines(a, b);
  assertReconstructs(a, b, ops);
  assert.deepEqual(ops, [
    { kind: " ", text: "const x = 1;" },
    { kind: "-", text: "const y = 2;" },
    { kind: "+", text: "const y = 3;" },
    { kind: " ", text: "return x + y;" },
  ]);
});

test("insertions and deletions in the middle reconstruct both sides", () => {
  const a = ["a", "b", "c", "d", "e"];
  const b = ["a", "x", "c", "e", "f"];
  const ops = diffLines(a, b);
  assertReconstructs(a, b, ops);
  // Minimal edit script: 2 deletions, 2 insertions.
  assert.equal(ops.filter((o) => o.kind === "-").length, 2);
  assert.equal(ops.filter((o) => o.kind === "+").length, 2);
});

test("completely different inputs reconstruct both sides", () => {
  const a = ["one", "two", "three"];
  const b = ["four", "five"];
  assertReconstructs(a, b, diffLines(a, b));
});

test("repeated lines diff correctly", () => {
  const a = ["x", "x", "x"];
  const b = ["x", "x"];
  const ops = diffLines(a, b);
  assertReconstructs(a, b, ops);
  assert.equal(ops.filter((o) => o.kind === "-").length, 1);
});

test("oversized cores fall back to whole-replace without losing lines", () => {
  const a = Array.from({ length: 6000 }, (_, i) => `a${i}`);
  const b = Array.from({ length: 6000 }, (_, i) => `b${i}`);
  const ops = diffLines(a, b);
  assertReconstructs(a, b, ops);
});

test("common prefix and suffix stay context even around a large core", () => {
  const a = ["keep1", ...Array.from({ length: 6000 }, (_, i) => `a${i}`), "keep2"];
  const b = ["keep1", ...Array.from({ length: 6000 }, (_, i) => `b${i}`), "keep2"];
  const ops = diffLines(a, b);
  assertReconstructs(a, b, ops);
  assert.deepEqual(ops[0], { kind: " ", text: "keep1" });
  assert.deepEqual(ops[ops.length - 1], { kind: " ", text: "keep2" });
});

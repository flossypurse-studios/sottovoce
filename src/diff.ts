// Minimal line-level diff (Myers' O(ND) algorithm). Pure — no I/O.
//
// Small by design: check --diff shows what changed inside one code fence, so
// inputs are snippet-sized. The common prefix/suffix are trimmed first, which
// keeps the search tiny for the typical "few lines drifted" case, and inputs
// whose trimmed cores are still huge fall back to a whole-replace diff rather
// than risk the O(D^2) trace memory.

export interface DiffOp {
  /** " " context (in both), "-" only in a, "+" only in b. */
  kind: " " | "-" | "+";
  text: string;
}

/** Trimmed cores larger than this diff as delete-all/insert-all. */
const MYERS_LIMIT = 5000;

export function diffLines(
  a: readonly string[],
  b: readonly string[],
): DiffOp[] {
  // Trim common prefix and suffix.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const coreA = a.slice(start, endA);
  const coreB = b.slice(start, endB);
  const core =
    coreA.length + coreB.length > MYERS_LIMIT
      ? [
          ...coreA.map((text): DiffOp => ({ kind: "-", text })),
          ...coreB.map((text): DiffOp => ({ kind: "+", text })),
        ]
      : myers(coreA, coreB);

  return [
    ...a.slice(0, start).map((text): DiffOp => ({ kind: " ", text })),
    ...core,
    ...a.slice(endA).map((text): DiffOp => ({ kind: " ", text })),
  ];
}

function myers(a: readonly string[], b: readonly string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];

  // v[offset + k] = furthest x on diagonal k after each round; snapshots per
  // round let the backtrack recover the path.
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];

  search: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (
        k === -d ||
        (k !== d && (v[offset + k - 1] as number) < (v[offset + k + 1] as number))
      ) {
        x = v[offset + k + 1] as number;
      } else {
        x = (v[offset + k - 1] as number) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break search;
    }
  }

  const ops: DiffOp[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d] as Int32Array;
    const k = x - y;
    let prevK: number;
    if (
      k === -d ||
      (k !== d && (vd[offset + k - 1] as number) < (vd[offset + k + 1] as number))
    ) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vd[offset + prevK] as number;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ kind: " ", text: a[x - 1] ?? "" });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ kind: "+", text: b[prevY] ?? "" });
      else ops.push({ kind: "-", text: a[prevX] ?? "" });
    }
    x = prevX;
    y = prevY;
  }
  ops.reverse();
  return ops;
}

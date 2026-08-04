# sottovoce

CLI that syncs code snippets from source repos into markdown/MDX docs. See README.md for user-facing behavior — it is the spec.

## Stack

TypeScript (strict, ESM, NodeNext), Node >= 20. One runtime dependency: `fast-glob`. Tests use the built-in `node:test` runner via `tsx`.

## Key paths

| Path | Contents |
|------|----------|
| `src/directive.ts` | Parse `sotto` directive comments in docs files |
| `src/extract.ts` | Region/line-range extraction, dedent, language inference |
| `src/merge.ts` | Rewrite docs fences (pure — no I/O) |
| `src/list.ts` | Directive inventory for the `list` command (pure — no I/O) |
| `src/sources.ts` | Resolve sources: local paths, shallow-fetched repo cache |
| `src/run.ts` | Glob docs, wire sources to merge, write files |
| `src/cli.ts` | `sync` / `check` / `list` commands |

## Build and test

```sh
npm install
npm run build   # tsc
npm test        # node:test via tsx
```

## Rules

- `merge.ts` stays pure (string in, string out) — all filesystem and network I/O lives in `run.ts` and `sources.ts`.
- Every behavior change lands with a test. The merge path must stay idempotent: syncing twice produces byte-identical output.
- Broken directives must never delete docs content — report and leave the fence untouched.
- Keep runtime dependencies at one (`fast-glob`). Argue in a PR before adding another.
- Maintainers publish releases; contributors should not bump the version.

## Visibility

PUBLIC repo. No secrets, no internal context in code, comments, commits, or PRs.

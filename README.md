# sottovoce

Sync real, tested code from source repos into your docs — quietly.

Docs code samples rot. The example compiles the day you paste it, then the SDK moves and the docs don't. sottovoce makes your docs reference code that actually lives in a repo — ideally one your CI already builds and runs — and keeps the two in sync. Same job as marker-based snippet sync tools like [snipsync](https://github.com/temporalio/snipsync), with one design goal added: leave the smallest possible footprint in both the source and the docs.

How it stays quiet:

- **Source files need no special markers.** Reference a whole file, a line range, or a named region. Regions use the `// #region name` / `// #endregion` markers editors already fold on, so they read as ordinary code organization.
- **Docs need one comment line per snippet**, not a wrapper pair. The code fence below it is a normal fence — sottovoce rewrites its contents in place, idempotently.
- **Synced code is committed**, not fetched at build time. Docs builds stay network-free, snippet changes show up in reviewable diffs, and anything that indexes your docs sees real code.

## Install

```sh
npm install --save-dev sottovoce
```

Requires Node 20+ and git on PATH.

## Quickstart

Add `sottovoce.json` to your docs repo:

```json
{
  "docs": ["docs/**/*.{md,mdx}"],
  "sources": {
    "ts": { "repo": "your-org/examples-ts", "ref": "v1.4.0" },
    "local": { "path": "../examples" }
  }
}
```

Reference a snippet in any markdown or MDX file — a directive comment followed by a code fence:

```markdown
<!-- sotto ts:src/checkout.ts#purchase -->
```

In MDX, use `{/* sotto ts:src/checkout.ts#purchase */}`.

Then run:

```sh
npx sottovoce sync
```

Every directive's fence now holds the current code from the source repo. If no fence exists yet, sottovoce inserts one. Run it again and nothing changes — that's the point.

## Referencing code

The directive form is `<source>:<path>[#region] [options]`.

A **whole file** needs nothing in the source:

```markdown
<!-- sotto ts:src/worker.ts -->
```

A **named region** uses editor-native fold markers in the source file:

```ts
// #region purchase
const receipt = await checkout(cart);
// #endregion
```

```markdown
<!-- sotto ts:src/checkout.ts#purchase -->
```

Any common comment leader works (`//`, `#`, `--`, `;`, `'`, `%`, `/* */`, `<!-- -->`), plus bare `#region` for C#. Regions can nest; inner markers are stripped from output. A **line range** is the escape hatch for code you can't annotate:

```markdown
<!-- sotto ts:package.json lines=1-5 -->
```

Options: `lines=A-B` and `lang=x` (fence language override — otherwise inferred from the file extension). If your fence already carries an info string (`ts {3-5} title="checkout.ts"`), sottovoce preserves it.

Snippets are dedented to their shallowest line, blank edges are trimmed, and fences widen automatically when a snippet contains backtick runs. Snippets inside lists inherit the fence's indentation.

## Sources

Each named source is either a GitHub repo pinned to a ref, or a local path:

```json
{
  "ts": { "repo": "your-org/examples-ts", "ref": "v1.4.0" },
  "wip": { "path": "../examples" }
}
```

Pin `ref` to the release tag your docs describe — that's what keeps a docs version honest. Branches, tags, and full commit SHAs all work. Repos are shallow-fetched into `~/.cache/sottovoce/`; `--offline` reuses the cache without touching the network. Private repos work through your ambient git credentials.

## CI: the drift alarm

```sh
npx sottovoce check
```

Exits non-zero if any fence is stale or any directive is broken (missing file, missing region, unknown source), printing each problem with its file and line. Wire it into the docs repo's CI and snippet drift becomes a failing build instead of a silent lie:

```yaml
- run: npx sottovoce check
```

Broken directives never destroy content — the existing fence is left untouched and the problem is reported.

## License

MIT

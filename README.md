# sottovoce

Sync real, tested code from source repos into your docs — quietly.

Docs code samples rot. The example compiles the day you paste it, then the SDK moves and the docs don't. sottovoce makes your docs reference code that actually lives in a repo — ideally one your CI already builds and runs — and keeps the two in sync. Same job as marker-based snippet sync tools like [snipsync](https://github.com/temporalio/snipsync), with one design goal added: leave the smallest possible footprint in both the source and the docs.

How it stays quiet:

- **Source files need no special markers.** Reference a whole file, a line range, or a named region. Regions use the `// #region name` / `// #endregion` markers editors already fold on, so they read as ordinary code organization.
- **Docs need one comment line per snippet**, not a wrapper pair. The code fence below it is a normal fence — sottovoce rewrites its contents in place, idempotently.
- **Synced code is committed**, not fetched at build time. Docs builds stay network-free, snippet changes show up in reviewable diffs, and anything that indexes your docs sees real code.

## Install

Not on npm yet — until the first release, install straight from GitHub:

```sh
npm install --save-dev github:flossypurse-studios/sottovoce
```

Requires Node 20+ and git on PATH.

## Quickstart

Everything here runs locally — no GitHub org, no credentials. Add `sottovoce.json` to your docs repo, pointing a source at a directory of example code:

```json
{
  "docs": ["docs/**/*.{md,mdx}"],
  "sources": {
    "local": { "path": "../examples" }
  }
}
```

Reference a snippet in any markdown or MDX file — a directive comment followed by a code fence:

```markdown
<!-- sotto local:src/checkout.ts#purchase -->
```

In MDX, use `{/* sotto local:src/checkout.ts#purchase */}`.

Then run:

```sh
npx sottovoce sync
```

Every directive's fence now holds the current code from the source repo. If no fence exists yet, sottovoce inserts one. Run it again and nothing changes — that's the point.

## Referencing code

The directive form is `<source>:<path>[#region] [options]`.

A **whole file** needs nothing in the source:

```markdown
<!-- sotto local:src/worker.ts -->
```

A **named region** uses editor-native fold markers in the source file:

```ts
// #region purchase
const receipt = await checkout(cart);
// #endregion
```

```markdown
<!-- sotto local:src/checkout.ts#purchase -->
```

Any common comment leader works (`//`, `#`, `--`, `;`, `'`, `%`, `/* */`, `<!-- -->`), plus bare `#region` for C#. Regions can nest. Marker lines never appear in output — they are stripped from every extraction mode, including whole-file, so don't put meaning in them. A **line range** is the escape hatch for code you can't annotate (fragile by nature — an upstream edit shifts the lines, so prefer regions in files you control):

```markdown
<!-- sotto local:package.json lines=1-5 -->
```

Options: `lines=A-B` (or `lines=N` for a single line) and `lang=x`. Combining `lines=` with a `#region` selector is an error. The fence language is inferred from the file extension; `lang=x` replaces it, and if your fence carries extra metadata (`ts {3-5} title="checkout.ts"`), everything after the language token is preserved.

Snippets are dedented to their shallowest line, blank edges are trimmed, and fences widen automatically when a snippet contains backtick runs. Tilde fences work too. Snippets inside lists inherit the fence's indentation.

## Sources

Each named source is either a GitHub repo pinned to a ref, or a local path:

```json
{
  "ts": { "repo": "your-org/examples-ts", "ref": "v1.4.0" },
  "wip": { "path": "../examples" }
}
```

Pin `ref` to the release tag your docs describe — that's what keeps a docs version honest. Branches, tags, and full commit SHAs all work; if omitted, `ref` defaults to `main`. Only GitHub repos are supported as remote sources — for anything else, clone it yourself and use a `path` source. Repos are shallow-fetched into `~/.cache/sottovoce/` (respects `$XDG_CACHE_HOME`); `--offline` reuses the cache without touching the network. Private repos work through your ambient git credentials.

## CI: the drift alarm

```sh
npx sottovoce check
```

Exits non-zero if any fence is stale or any directive is broken (missing file, missing region, unknown source). Stale fences print as `drift: docs/guide.md:12`, broken directives as `docs/guide.md:12: <directive>: <what's wrong>` — both point at the directive line. Wire it into the docs repo's CI and snippet drift becomes a failing build instead of a silent lie:

```yaml
- run: npx sottovoce check
```

`sync` also exits non-zero when it hits a broken directive, even after writing every valid fence — so a CI job that syncs and commits won't quietly commit around a broken reference.

Broken directives never destroy content — the existing fence is left untouched and the problem is reported.

## License

MIT

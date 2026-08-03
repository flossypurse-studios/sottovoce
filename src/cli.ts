#!/usr/bin/env node
import { createRequire } from "node:module";
import { findConfig, loadConfig } from "./config.js";
import { diffLines } from "./diff.js";
import type { ListEntry } from "./list.js";
import { runList, runSync } from "./run.js";

const pkg = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const HELP = `sottovoce — sync real, tested code from source repos into your docs, quietly.

Usage:
  sottovoce sync [options]    extract snippets and rewrite docs code fences (default command)
  sottovoce check [options]   like sync, but write nothing; exit 1 on drift
  sottovoce list [options]    inventory every directive in the docs tree (parse-only, no network)

sync and check exit 1 when any directive is broken (missing file, missing
region, unknown source). list always exits 0 — it reports, check enforces.

Options:
  --config <file>   path to sottovoce.json (default: nearest, walking up from cwd)
  --offline         use cached repo clones, no network
  --check           same as the check command
  --diff            with check: print what changed under each drift line
  --json            with list: emit the inventory as a JSON array
  --version         print the sottovoce version
  --help            show this help

Docs reference snippets with a single comment directive followed by a code fence:

  <!-- sotto ts:src/checkout.ts#purchase -->
  \`\`\`ts
  (sottovoce keeps this fence in sync)
  \`\`\`

Directive form: <source>:<path>[#region[+region...]] [lines=A-B] [lang=x]
Sources are named in sottovoce.json — a GitHub repo pinned to a ref, or a local path.
Regions use editor-native markers in the source file: // #region name ... // #endregion
A + composes several regions from the same file, joined by blank lines in order.
`;

function fail(message: string): never {
  console.error(`sottovoce: ${message}`);
  process.exit(1);
}

function formatEntry(e: ListEntry): string {
  let ref = `${e.source}:${e.path}`;
  if (e.region) ref += `#${e.region}`;
  const parts = [ref];
  if (e.lines) {
    parts.push(
      `lines=${e.lines.start === e.lines.end ? e.lines.start : `${e.lines.start}-${e.lines.end}`}`,
    );
  }
  if (e.lang) parts.push(`lang=${e.lang}`);
  if (!e.sourceKnown) parts.push("[UNKNOWN SOURCE]");
  if (!e.hasFence) parts.push("[NO FENCE]");
  return `  ${e.line}: ${parts.join(" ")}`;
}

/** Print the directive inventory. Reports, never enforces — always exits 0. */
async function list(
  loaded: ReturnType<typeof loadConfig>,
  json: boolean,
): Promise<void> {
  const summary = await runList(loaded);
  if (json) {
    console.log(JSON.stringify([...summary.entries, ...summary.invalid], null, 2));
    return;
  }
  if (summary.files === 0) {
    console.error(
      `sottovoce: no files matched docs globs (${loaded.config.docs.join(", ")})`,
    );
    return;
  }
  if (summary.entries.length === 0 && summary.invalid.length === 0) {
    console.error(
      `sottovoce: no sotto directives found (scanned ${summary.files} file${summary.files === 1 ? "" : "s"} matching ${loaded.config.docs.join(", ")})`,
    );
    return;
  }
  const rows = [
    ...summary.entries.map((e) => ({ file: e.file, line: e.line, text: formatEntry(e) })),
    ...summary.invalid.map((inv) => ({
      file: inv.file,
      line: inv.line,
      text: `  ${inv.line}: [INVALID: ${inv.error}]`,
    })),
  ].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  let current: string | undefined;
  for (const row of rows) {
    if (row.file !== current) {
      if (current !== undefined) console.log("");
      current = row.file;
      console.log(row.file);
    }
    console.log(row.text);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let command: string | undefined;
  let configPath: string | undefined;
  let offline = false;
  let checkFlag = false;
  let json = false;
  let diff = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      return;
    } else if (arg === "--version" || arg === "-v") {
      console.log(pkg.version);
      return;
    } else if (arg === "--config") {
      configPath = args[++i];
      if (!configPath || configPath.startsWith("-")) {
        fail(`--config expects a file path${configPath ? `, got "${configPath}"` : ""}`);
      }
    } else if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
      if (!configPath) fail("--config expects a file path");
    } else if (arg === "--offline") {
      offline = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--diff") {
      diff = true;
    } else if (arg === "--check") {
      checkFlag = true;
    } else if (!arg.startsWith("-") && !command) {
      command = arg;
    } else {
      fail(`unknown argument "${arg}" (try --help)`);
    }
  }

  command = command ?? "sync";
  if (command !== "sync" && command !== "check" && command !== "list") {
    fail(`unknown command "${command}" (try --help)`);
  }
  if (json && command !== "list") {
    fail("--json is only valid with the list command");
  }
  const check = command === "check" || checkFlag;
  if (diff && !check) {
    fail("--diff is only valid with the check command");
  }

  const file = configPath ?? findConfig(process.cwd());
  if (!file) fail("no sottovoce.json found (run from your docs repo, or pass --config)");
  const loaded = loadConfig(file);

  if (command === "list") {
    await list(loaded, json);
    return;
  }

  const summary = await runSync(loaded, { check, offline });

  for (const w of summary.warnings) {
    console.error(`warning: ${w.file}:${w.line}: ${w.message}`);
  }
  for (const p of summary.problems) {
    console.error(`${p.file}${p.line > 0 ? `:${p.line}` : ""}: ${p.message}`);
  }

  const count = (n: number, word: string): string =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  const scanned = summary.files.length;
  const globs = loaded.config.docs.join(", ");
  // A run with nothing to do is more often a mistake (bad glob, mis-placed
  // docs) than intent — say so instead of printing an all-zero summary.
  if (scanned === 0) {
    console.error(`sottovoce: no files matched docs globs (${globs})`);
    return;
  }
  const directives = summary.files.reduce((n, f) => n + f.directives, 0);
  if (directives === 0) {
    console.error(
      `sottovoce: no sotto directives found (scanned ${count(scanned, "file")} matching ${globs})`,
    );
    return;
  }

  const snippets = summary.updated + summary.unchanged;
  const changed = summary.files.filter((f) =>
    summary.changedFiles.includes(f.file),
  );
  if (check) {
    for (const f of changed) {
      if (f.updatedLines.length === 0) console.log(`drift: ${f.file}`);
      const driftByLine = new Map(f.drifts.map((d) => [d.line, d]));
      for (const line of f.updatedLines) {
        console.log(`drift: ${f.file}:${line}`);
        const d = diff ? driftByLine.get(line) : undefined;
        if (d) {
          // Two-space prefix keeps the diff visually subordinate to drift lines.
          for (const op of diffLines(d.actual, d.expected)) {
            console.log(`  ${op.kind} ${op.text}`.trimEnd());
          }
        }
      }
    }
    console.log(
      `checked ${count(snippets, "snippet")} across ${count(scanned, "file")}: ` +
        `${summary.unchanged} in sync, ${summary.updated} stale`,
    );
    if (summary.problems.length || summary.changedFiles.length) process.exit(1);
  } else {
    for (const f of changed) console.log(`wrote ${f.file}`);
    console.log(
      `synced ${count(snippets, "snippet")} across ${count(scanned, "file")}: ` +
        `${summary.updated} updated, ${summary.unchanged} unchanged` +
        (summary.changedFiles.length
          ? ` (${count(summary.changedFiles.length, "file")} written)`
          : ""),
    );
    if (summary.problems.length) process.exit(1);
  }
}

main().catch((err) => fail((err as Error).message));

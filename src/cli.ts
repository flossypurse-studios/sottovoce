#!/usr/bin/env node
import { findConfig, loadConfig } from "./config.js";
import { runSync } from "./run.js";

const HELP = `sottovoce — sync real, tested code from source repos into your docs, quietly.

Usage:
  sottovoce sync [options]    extract snippets and rewrite docs code fences
  sottovoce check [options]   like sync, but write nothing; exit 1 on drift

Options:
  --config <file>   path to sottovoce.json (default: nearest, walking up from cwd)
  --offline         use cached repo clones, no network
  --check           same as the check command
  --help            show this help

Docs reference snippets with a single comment directive followed by a code fence:

  <!-- sotto ts:src/checkout.ts#purchase -->
  \`\`\`ts
  (sottovoce keeps this fence in sync)
  \`\`\`

Directive form: <source>:<path>[#region] [lines=A-B] [lang=x]
Sources are named in sottovoce.json — a GitHub repo pinned to a ref, or a local path.
Regions use editor-native markers in the source file: // #region name ... // #endregion
`;

function fail(message: string): never {
  console.error(`sottovoce: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let command: string | undefined;
  let configPath: string | undefined;
  let offline = false;
  let checkFlag = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      console.log(HELP);
      return;
    } else if (arg === "--config") {
      configPath = args[++i];
      if (!configPath) fail("--config needs a value");
    } else if (arg === "--offline") {
      offline = true;
    } else if (arg === "--check") {
      checkFlag = true;
    } else if (!arg.startsWith("-") && !command) {
      command = arg;
    } else {
      fail(`unknown argument "${arg}" (try --help)`);
    }
  }

  command = command ?? "sync";
  if (command !== "sync" && command !== "check") {
    fail(`unknown command "${command}" (try --help)`);
  }
  const check = command === "check" || checkFlag;

  const file = configPath ?? findConfig(process.cwd());
  if (!file) fail("no sottovoce.json found (run from your docs repo, or pass --config)");
  const loaded = loadConfig(file);

  const summary = await runSync(loaded, { check, offline });

  for (const p of summary.problems) {
    console.error(`${p.file}:${p.line}: ${p.message}`);
  }

  const scanned = summary.files.length;
  if (check) {
    for (const f of summary.changedFiles) console.log(`drift: ${f}`);
    console.log(
      `checked ${scanned} file${scanned === 1 ? "" : "s"}: ` +
        `${summary.unchanged} in sync, ${summary.updated} stale`,
    );
    if (summary.problems.length || summary.changedFiles.length) process.exit(1);
  } else {
    console.log(
      `synced ${scanned} file${scanned === 1 ? "" : "s"}: ` +
        `${summary.updated} updated, ${summary.unchanged} unchanged` +
        (summary.changedFiles.length
          ? ` (${summary.changedFiles.length} file${summary.changedFiles.length === 1 ? "" : "s"} written)`
          : ""),
    );
    if (summary.problems.length) process.exit(1);
  }
}

main().catch((err) => fail((err as Error).message));

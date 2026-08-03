export { matchDirective, parseDirectiveBody, DirectiveError } from "./directive.js";
export {
  extractRegion,
  extractLines,
  wholeFile,
  tidy,
  inferLang,
  ExtractError,
} from "./extract.js";
export { mergeDoc } from "./merge.js";
export type { SnippetReader } from "./merge.js";
export { resolveSource, readSourceFile, SourceError } from "./sources.js";
export { findConfig, loadConfig, ConfigError, CONFIG_NAME } from "./config.js";
export type {
  Config,
  Directive,
  FileResult,
  SnippetProblem,
  SourceSpec,
} from "./types.js";
export { runSync } from "./run.js";
export type { SyncOptions, SyncSummary } from "./run.js";

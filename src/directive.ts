import type { Directive } from "./types.js";

// A directive is a single comment line:
//   <!-- sotto ts:src/checkout.ts#purchase -->        (markdown)
//   {/* sotto ts:src/checkout.ts#purchase */}          (MDX)
// followed by a code fence that sottovoce owns.
// The body capture must start AND end on non-whitespace — a lazy (.+?) here
// competes with the following \s* over trailing-space runs and goes quadratic.
const HTML_DIRECTIVE = /^(\s*)<!--\s*sotto\s+(\S(?:.*\S)?)\s*-->\s*$/;
const MDX_DIRECTIVE = /^(\s*)\{\/\*\s*sotto\s+(\S(?:.*\S)?)\s*\*\/\}\s*$/;

/** Cheap shape test — true for any line that starts like a sotto directive. */
export function isDirectiveLine(line: string): boolean {
  return /^\s*(?:<!--|\{\/\*)\s*sotto\s/.test(line);
}

export interface DirectiveMatch {
  directive: Directive;
  /** Leading whitespace of the directive line. */
  indent: string;
  /** Which comment form the directive used. */
  form: "html" | "mdx";
}

export class DirectiveError extends Error {}

/** Parse a single docs line. Returns null if it is not a sotto directive. */
export function matchDirective(docLine: string, lineNo: number): DirectiveMatch | null {
  const html = HTML_DIRECTIVE.exec(docLine);
  const m = html ?? MDX_DIRECTIVE.exec(docLine);
  if (!m) return null;
  const indent = m[1] ?? "";
  const body = m[2] ?? "";
  return {
    directive: parseDirectiveBody(body, lineNo),
    indent,
    form: html ? "html" : "mdx",
  };
}

export function parseDirectiveBody(body: string, lineNo: number): Directive {
  const tokens = body.split(/\s+/).filter(Boolean);
  const ref = tokens.shift();
  if (!ref) throw new DirectiveError("empty directive");

  const colon = ref.indexOf(":");
  if (colon <= 0 || colon === ref.length - 1) {
    throw new DirectiveError(
      `expected "<source>:<path>[#region]", got "${ref}"`,
    );
  }
  const source = ref.slice(0, colon);
  let path = ref.slice(colon + 1);
  let region: string | undefined;
  const hash = path.indexOf("#");
  if (hash >= 0) {
    region = path.slice(hash + 1);
    path = path.slice(0, hash);
    if (!region) throw new DirectiveError(`empty region name in "${ref}"`);
    if (!path) throw new DirectiveError(`empty path in "${ref}"`);
  }

  const directive: Directive = { source, path, region, line: lineNo, raw: body };

  for (const token of tokens) {
    const eq = token.indexOf("=");
    const key = eq >= 0 ? token.slice(0, eq) : token;
    const value = eq >= 0 ? token.slice(eq + 1) : "";
    switch (key) {
      case "lines": {
        if (directive.region) {
          throw new DirectiveError(
            "lines= cannot be combined with a #region selector",
          );
        }
        const m = /^(\d+)(?:-(\d+))?$/.exec(value);
        if (!m || !m[1]) {
          throw new DirectiveError(`bad lines option "${token}" (want lines=4-9)`);
        }
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : start;
        if (start < 1 || end < start) {
          throw new DirectiveError(`bad line range "${token}"`);
        }
        directive.lines = { start, end };
        break;
      }
      case "lang":
        if (!value) throw new DirectiveError(`empty lang option`);
        directive.lang = value;
        break;
      default:
        if (eq < 0) {
          throw new DirectiveError(
            `unexpected token "${token}" — paths and region names cannot contain spaces; options look like key=value`,
          );
        }
        throw new DirectiveError(`unknown option "${token}"`);
    }
  }

  return directive;
}

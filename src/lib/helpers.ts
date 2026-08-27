import type { ApiResponse, Helper } from "../types";
import { isIdentifier, uniqueNameProblem, type NameProblem } from "./unique-names";

/** What a new entry starts as: a real declaration, because the declaration is the whole form.
 *
 * The JSDoc block is part of the seed so the typing is discovered by seeing it, not by reading
 * about it somewhere. */
export function defaultHelperCode(name: string): string {
  return `/**
 * @param {string} value
 */
function ${name}(value) {
  console.log("value: " + value);
  return value;
}
`;
}

/** Seed for a function built from a response. The parameter is called `response` because that
 * is what it is; `data.body` reads like an accident.
 *
 * Annotating it `{object}` is what makes a by-hand run offer a JSON box rather than a text
 * field, so the function is testable from the picker too, not only from the sample pane. */
export function responseHelperCode(name: string): string {
  return `/**
 * @param {object} response
 */
function ${name}(response) {
  return response.body;
}
`;
}

export function defaultHelper(id: string, name: string): Helper {
  return { id, name, params: ["value"], code: defaultHelperCode(name) };
}

/** A function whose first parameter is a response. What it is tried against never lives on
 * the function: the sample rides to the editor for one session and is not stored. */
export function responseHelper(id: string, name: string): Helper {
  return { id, name, params: ["response"], code: responseHelperCode(name) };
}

/** The types a JSDoc `@param` can name that this app knows how to render a field for. */
export type ParamType = "string" | "number" | "boolean" | "object" | "array";

/** One parameter of the exported function.
 *
 * `type` is `null` when the source did not annotate it — the argument then stays a plain
 * string, which is what it always was. `default` is the source text written after `=` in the
 * declaration, so the prompt can show what leaving the field blank will use. */
export type HelperParam = { name: string; type: ParamType | null; default?: string | null };

/** What the engine read back out of an entry's source. */
export type HelperSignature = {
  name: string | null;
  params: HelperParam[];
  /** `"no-function"` when the source declares none; otherwise the engine's message. */
  error: string | null;
};

export type ArgProblem = "not-a-number" | "invalid-json";
export type ArgValue = { ok: true; value: unknown } | { ok: false; error: ArgProblem };

/**
 * Turns what was typed into the prompt into the value the function receives.
 *
 * The prompt only ever edits text, so this is where a `@param {number}` becomes a number.
 * Without an annotation nothing is guessed: the argument stays a string. Inferring "looks like
 * JSON, must be JSON" would silently turn a DNI into a number, and there would be no way to
 * say otherwise.
 *
 * Blank is `undefined` rather than a zero or an empty object, so a parameter written with a
 * default (`function f(monto = 10)`) gets its default.
 */
export function coerceArgument(text: string, type: ParamType | null): ArgValue {
  if (type === null || type === "string") return { ok: true, value: text };
  if (type === "boolean") return { ok: true, value: text === "true" };
  if (text.trim() === "") return { ok: true, value: undefined };

  if (type === "number") {
    const value = Number(text);
    return Number.isNaN(value) ? { ok: false, error: "not-a-number" } : { ok: true, value };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  if (type === "array" && !Array.isArray(parsed)) return { ok: false, error: "invalid-json" };
  if (type === "object" && (Array.isArray(parsed) || parsed === null || typeof parsed !== "object")) {
    return { ok: false, error: "invalid-json" };
  }
  return { ok: true, value: parsed };
}

/** Two entries declaring the same function name would make `lib.<name>` ambiguous. Everything
 * else about the name is JavaScript's problem, and the engine already reported it. */
export function helperNameProblem(
  name: string,
  helpers: readonly Helper[],
  selfId: string
): NameProblem {
  return uniqueNameProblem(name, helpers, selfId);
}

export const FALLBACK_HELPER_NAME = "newFunction";

/** Turns a request title into something that can be written after `function`.
 *
 * Accents are folded rather than dropped (`Búsqueda` → `busqueda`), because the engine only
 * accepts ASCII identifiers and silently losing letters would make worse names than folding.
 * Returns `""` when nothing usable is left.
 */
export function identifierFromTitle(title: string): string {
  const words = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "";

  // An all-caps word is a shout, not casing worth keeping: "GET /api/users" should read
  // getApiUsers, not gETApiUsers. Anything else keeps its own case, so a title that is already
  // camelCase survives intact.
  const camel = words
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word.toLowerCase() : word))
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join("");
  return isIdentifier(camel) ? camel : "";
}

/**
 * A name no other entry is using, by appending a counter: `example`, `example2`, `example3`.
 *
 * Names have to be unique because every entry is reachable through the same `lib`, so two
 * functions called the same thing would shadow each other with no way to tell which won.
 */
export function uniqueHelperName(base: string, helpers: readonly Helper[]): string {
  const taken = new Set(helpers.map((helper) => helper.name.trim().toLowerCase()));
  const start = base.trim() || FALLBACK_HELPER_NAME;
  if (!taken.has(start.toLowerCase())) return start;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${start}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Entry script that calls one library function with the given arguments.
 *
 * The name is embedded as a string rather than as `lib.name` so a name that somehow got past
 * validation cannot turn into arbitrary code. */
export function helperCallCode(name: string): string {
  return `return lib[${JSON.stringify(name.trim())}](...args);`;
}

/** One argument per declared parameter, padded when the stored sample is shorter than the
 * current parameter list and trimmed when a parameter was removed. */
export function helperCallArgs(params: readonly string[], values: readonly string[]): string[] {
  return params.map((_, index) => values[index] ?? "");
}

/** How a function reads in a list: `cuil(dni, gender)`. Takes the cached parameter names,
 * which is all the picker has without asking the engine. */
export function helperSignatureText(name: string, params: readonly string[]): string {
  return `${name}(${params.join(", ")})`;
}

/** The same, with the types the source declared: `cuil(dni: string, monto: number)`. A
 * parameter nobody annotated shows its bare name rather than a `: string` nobody wrote. */
export function typedSignatureText(name: string, params: readonly HelperParam[]): string {
  const rendered = params.map((param) =>
    param.type ? `${param.name}: ${param.type}` : param.name
  );
  return `${name}(${rendered.join(", ")})`;
}

/** Repeated header names are joined with ", ", matching `Headers.get()`, so a script can read
 * `response.headers["set-cookie"]` without knowing there were two of them. */
function headerLookup(headers: ApiResponse["headers"]): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const [key, value] of headers) {
    lookup[key] = key in lookup ? `${lookup[key]}, ${value}` : value;
  }
  return lookup;
}

/**
 * The sample a function created from a response is tried against: the whole response as JSON,
 * pretty-printed, with a JSON body already parsed so it reads as structure rather than as an
 * escaped string.
 *
 * It is plain editable JSON — whatever is in the pane is what the function receives.
 */
export function responseSampleJson(response: ApiResponse): string {
  let body: unknown = response.body;
  try {
    body = JSON.parse(response.body);
  } catch {
    body = response.body;
  }
  return JSON.stringify(
    { status: response.status, headers: headerLookup(response.headers), body },
    null,
    2
  );
}

export type SampleParse = { ok: true; value: unknown } | { ok: false; error: "invalid-json" };

/** The sample pane is JSON the user can edit, so it can be broken; running with a broken one
 * has to say so rather than quietly handing the function a string. */
export function parseSampleResponse(sample: string): SampleParse {
  try {
    return { ok: true, value: JSON.parse(sample) };
  } catch {
    return { ok: false, error: "invalid-json" };
  }
}


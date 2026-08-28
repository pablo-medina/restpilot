import {
  FALLBACK_HELPER_NAME,
  identifierFromTitle,
  uniqueHelperName
} from "../lib/helpers";
import type { AppConfig, Helper, SavedRequest, TreeItem } from "../types";

/**
 * One-time rewrite of extractors into library functions.
 *
 * Extractors and functions did the same job from different ends: an extractor was a bare
 * function *body* with `response` in scope, a library function is a declaration anything can
 * call. Rather than drop people's scripts, each one is wrapped into a declaration and the
 * requests that used it are pointed at the function instead.
 *
 * It also picks up the even older `functions` key, from before extractors existed, because
 * those held the same kind of body under `extractorCode`. One hop instead of two.
 *
 * Delete this module, its test, and the `configVersion` gate in `normalizeConfig()` once no
 * config in the wild predates the change.
 */

/** What a stored extractor looked like. Typed here rather than in `types.ts` because nothing
 * but this migration understands the shape any more. */
type LegacyExtractor = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  code?: unknown;
  /** The pre-extractor `functions` entries carried the body under this name instead. */
  extractorCode?: unknown;
};

/** The parts of a stored config this migration reads. Normalization has already dropped them
 * from its own output, so the raw object has to be passed alongside. */
export type LegacyExtractorSource = {
  extractors?: unknown;
  functions?: unknown;
  items?: unknown;
};

export function needsExtractorMigration(configVersion: number | undefined): boolean {
  return (configVersion ?? 0) < 3;
}

/** Wraps a bare extractor body into a declaration a script can call. */
function functionFromExtractorBody(name: string, body: string): string {
  return `/**
 * @param {object} response
 */
function ${name}(response) {
${body.trimEnd()}
}
`;
}

function readBody(entry: LegacyExtractor): string {
  const code = typeof entry.code === "string" ? entry.code : "";
  if (code.trim()) return code;
  const legacy = typeof entry.extractorCode === "string" ? entry.extractorCode : "";
  return legacy.trim() ? legacy : "";
}

function legacyEntries(source: LegacyExtractorSource): LegacyExtractor[] {
  const from =
    Array.isArray(source.extractors) && source.extractors.length ? source.extractors : source.functions;
  if (!Array.isArray(from)) return [];
  return from.filter((entry): entry is LegacyExtractor => Boolean(entry) && typeof entry === "object");
}

/** Which extractor each stored request used, by request id. */
function assignments(source: LegacyExtractorSource): Map<string, { id: string; variable: string }> {
  const found = new Map<string, { id: string; variable: string }>();
  if (!Array.isArray(source.items)) return found;

  for (const item of source.items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; extractor?: { extractorId?: unknown; variable?: unknown } };
    const extractorId = record.extractor?.extractorId;
    if (typeof record.id !== "string" || typeof extractorId !== "string" || !extractorId) continue;
    const variable = typeof record.extractor?.variable === "string" ? record.extractor.variable.trim() : "";
    found.set(record.id, { id: extractorId, variable });
  }
  return found;
}

/**
 * Applies the legacy extractors in `source` onto an already-normalized `config`.
 *
 * `source` is the raw stored object: normalization drops both `extractors` and each request's
 * `extractor`, so by the time this runs there is nothing left in `config` to read.
 *
 * Idempotent by construction — a source with no extractors produces nothing, and the upgrade
 * is gated on `configVersion` anyway.
 */
export function migrateExtractors(config: AppConfig, source: LegacyExtractorSource): AppConfig {
  const entries = legacyEntries(source);
  if (entries.length === 0) return config;

  const helpers: Helper[] = [...config.helpers];
  /** Old extractor id → the function it became. */
  const moved = new Map<string, Helper>();

  for (const entry of entries) {
    const body = readBody(entry);
    if (!body.trim()) continue;

    const title = typeof entry.name === "string" ? entry.name : "";
    const name = uniqueHelperName(identifierFromTitle(title) || FALLBACK_HELPER_NAME, helpers);
    const description = typeof entry.description === "string" ? entry.description.trim() : "";

    const helper: Helper = {
      id: crypto.randomUUID(),
      name,
      params: ["response"],
      code: functionFromExtractorBody(name, body),
      description: description || undefined
    };

    helpers.push(helper);
    if (typeof entry.id === "string" && entry.id) moved.set(entry.id, helper);
  }

  const used = assignments(source);
  const items: TreeItem[] = config.items.map((item) => {
    if (item.kind !== "request") return item;
    const assignment = used.get(item.id);
    if (!assignment) return item;

    const helper = moved.get(assignment.id);
    // An assignment pointing at an extractor that is not there any more leaves the request
    // with no function, which is what it effectively had.
    if (!helper) return item;

    const call: SavedRequest["functionCall"] = {
      helperId: helper.id,
      variable: assignment.variable || undefined
    };
    return { ...item, functionCall: call };
  });

  return { ...config, helpers, items };
}

import { LEGACY_CONFIG_VERSION, type AppConfig, type AppFunction, type Pair, type RequestAuth, type SavedRequest } from "../types";

/**
 * One-time rewrite of stored data from the legacy `${name}` template syntax to `{{name}}`.
 *
 * This is a data migration, not a compatibility layer: the resolver in `src/lib/variables.ts`
 * only ever understands `{{name}}`. Configs older than `CONFIG_VERSION` 2 are upgraded once on
 * load, and RestPilot collection exports are upgraded on every import because those files embed
 * raw items and carry no config version of their own.
 *
 * Delete this module, its test, and the `configVersion` gate in `normalizeConfig()` once no
 * config in the wild predates the change.
 *
 * Only fields that `applyVariables()` actually resolves are rewritten. Deliberately excluded:
 * - **Variable values** — there is no nested resolution (see ROADMAP 3.8), so a `${x}` inside a
 *   variable value is literal text today, not a template.
 * - **`extractorCode`** — JavaScript, where `${}` is a real template literal. Rewriting it would
 *   break working extractors.
 */

const LEGACY_TEMPLATE = /\$\{([^}]+)\}/g;

/** Rewrites every `${name}` occurrence in a single text field. Idempotent: `{{name}}` has no
 * `${` left to match, so running it twice changes nothing. */
export function migrateTemplateText(value: string): string {
  return value.replace(LEGACY_TEMPLATE, "{{$1}}");
}

function migratePairs(pairs: Pair[]): Pair[] {
  return pairs.map((pair) => ({
    ...pair,
    key: migrateTemplateText(pair.key),
    value: migrateTemplateText(pair.value)
  }));
}

/** Every auth field that `request-auth.ts` runs through `applyVariables()` before sending. */
const AUTH_TEXT_KEYS = [
  "bearerToken",
  "basicUsername",
  "basicPassword",
  "basicToken",
  "apiKeyName",
  "apiKeyValue"
] as const;

function migrateAuth(auth: RequestAuth): RequestAuth {
  const next: RequestAuth = { ...auth };
  for (const key of AUTH_TEXT_KEYS) {
    const value = next[key];
    if (typeof value === "string") next[key] = migrateTemplateText(value);
  }
  return next;
}

function migrateRequest(request: SavedRequest): SavedRequest {
  return {
    ...request,
    url: migrateTemplateText(request.url),
    urlHash: request.urlHash === undefined ? undefined : migrateTemplateText(request.urlHash),
    body: migrateTemplateText(request.body),
    graphqlVariables:
      request.graphqlVariables === undefined ? undefined : migrateTemplateText(request.graphqlVariables),
    queryParams: migratePairs(request.queryParams),
    headers: migratePairs(request.headers),
    form: migratePairs(request.form),
    auth: migrateAuth(request.auth)
  };
}

function migrateFunction(func: AppFunction): AppFunction {
  return {
    ...func,
    url: migrateTemplateText(func.url),
    body: migrateTemplateText(func.body),
    graphqlVariables: func.graphqlVariables === undefined ? undefined : migrateTemplateText(func.graphqlVariables),
    queryParams: migratePairs(func.queryParams),
    headers: migratePairs(func.headers),
    form: migratePairs(func.form),
    auth: migrateAuth(func.auth)
  };
}

/** True when `storedVersion` predates the `{{name}}` switch. Missing version means a config
 * written before versioning existed, which is by definition legacy. */
export function needsVariableSyntaxMigration(storedVersion: unknown): boolean {
  const version = typeof storedVersion === "number" ? storedVersion : LEGACY_CONFIG_VERSION;
  return version <= LEGACY_CONFIG_VERSION;
}

export function migrateVariableSyntax(config: AppConfig): AppConfig {
  return {
    ...config,
    items: config.items.map((item) => (item.kind === "request" ? migrateRequest(item) : item)),
    functions: config.functions.map(migrateFunction)
  };
}

import { clampMaxOpenTabs, clampTabSize } from "../types";
import { normalizeProxySettings } from "./proxy-settings";
import { normalizeDuplicateNaming } from "./collection-names";
import { hydrateRequestAuth, normalizeRequestAuth } from "./request-auth";
import { migrateRequestQuery } from "../lib/url-params";
import { normalizeParentId } from "./collection-parent";
import { migrateVariableSyntax, needsVariableSyntaxMigration } from "./migrate-variable-syntax";
import {
  clampRequestTimeoutSecs,
  clampScriptTimeoutSecs,
  CONFIG_VERSION,
  DEFAULT_PROXY_TEST_URL,
  defaultSettings,
  type ApiResponse,
  type AppConfig,
  type BodyMode,
  type Environment,
  type Extractor,
  type Helper,
  type RequestExtractor,
  type FormPartType,
  type HeaderPair,
  type Pair,
  type RawType,
  type SavedRequest,
  type SavedResponseHistoryItem,
  type TreeItem,
  type Variable
} from "../types";

/** Accepts the legacy `Record<string,string>` shape (pre-migration configs) or the
 * current `[name, value][]` shape, and always returns the latter. */
function normalizeHeaderPairs(raw: unknown): HeaderPair[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length === 2)
      .map(([key, value]) => [String(key), String(value)] as HeaderPair);
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, String(value)] as HeaderPair);
  }
  return [];
}

/** Normalizes a stored `ApiResponse`, tolerating configs saved before headers
 * became a list or before `body_is_base64`/`body_size` existed. */
export function normalizeApiResponse(raw: unknown): ApiResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.status !== "number") return null;
  const body = String(value.body ?? "");
  return {
    status: value.status,
    status_text: String(value.status_text ?? ""),
    duration_ms: Number(value.duration_ms ?? 0),
    headers: normalizeHeaderPairs(value.headers),
    body,
    body_is_base64: value.body_is_base64 === true,
    body_size: typeof value.body_size === "number" ? value.body_size : body.length
  };
}

export function normalizeSavedResponseHistoryItem(raw: Record<string, unknown>): SavedResponseHistoryItem {
  const body = String(raw.body ?? "");
  return {
    id: String(raw.id || crypto.randomUUID()),
    title: String(raw.title ?? "Saved Response"),
    timestamp: Number(raw.timestamp ?? Date.now()),
    status: Number(raw.status ?? 200),
    status_text: String(raw.status_text ?? "OK"),
    duration_ms: Number(raw.duration_ms ?? 0),
    headers: normalizeHeaderPairs(raw.headers),
    body,
    body_is_base64: raw.body_is_base64 === true,
    body_size: typeof raw.body_size === "number" ? raw.body_size : body.length
  };
}

function normalizeExtractor(raw: Record<string, unknown>): Extractor {
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  return {
    id: String(raw.id || crypto.randomUUID()),
    name: String(raw.name ?? "").trim(),
    description: description || undefined,
    code: String(raw.code ?? ""),
    sampleText: String(raw.sampleText ?? "")
  };
}

/** Extractors replaced the Functions section. A stored function only ever contributed its
 * extractor script, so anything with one is carried over rather than dropped. Delete the
 * `legacyFunctionExtractors` branch once no config in the wild still has `functions`. */
function normalizeExtractors(config: AppConfig & { functions?: unknown }): Extractor[] {
  const stored = Array.isArray(config.extractors) ? config.extractors : null;
  const raw = stored ?? legacyFunctionExtractors(config.functions);
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map(normalizeExtractor)
    .filter((extractor) => extractor.name !== "");
}

function legacyFunctionExtractors(functions: unknown): Record<string, unknown>[] {
  if (!Array.isArray(functions)) return [];
  return functions
    .filter((func) => func && typeof func === "object" && String((func as Record<string, unknown>).extractorCode ?? "").trim())
    .map((func) => {
      const item = func as Record<string, unknown>;
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        code: item.extractorCode,
        sampleText: String((item.lastHttpResponse as { body?: unknown } | null | undefined)?.body ?? "")
      };
    });
}

function normalizeHelper(raw: Record<string, unknown>): Helper {
  const description = String(raw.description ?? "").trim();
  const code = String(raw.code ?? "");
  const params = Array.isArray(raw.params) ? raw.params : [];
  const sampleArgs = Array.isArray(raw.sampleArgs) ? raw.sampleArgs : null;
  // The cached signature is only as good as the last save; `code` is what the engine reads,
  // and the editor refreshes both whenever the source is parsed.
  return {
    id: String(raw.id || crypto.randomUUID()),
    name: String(raw.name ?? "").trim(),
    description: description || undefined,
    params: params.map((param) => String(param ?? "")).filter((param) => param !== ""),
    code,
    sampleArgs: sampleArgs ? sampleArgs.map((value) => String(value ?? "")) : undefined
  };
}

/** Stored under `helpers`. The `functions` key is a different, removed feature — see
 * `legacyFunctionExtractors` — and must not be read here. */
function normalizeHelpers(config: AppConfig): Helper[] {
  const raw: unknown[] = Array.isArray(config.helpers) ? config.helpers : [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map(normalizeHelper)
    .filter((helper) => helper.code.trim() !== "");
}

function normalizeRequestExtractor(raw: unknown): RequestExtractor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const extractorId = String(value.extractorId ?? "");
  if (!extractorId) return undefined;
  const variable = String(value.variable ?? "").trim();
  return { extractorId, variable: variable || undefined };
}

function normalizeVariable(variable: Variable): Variable {

  return {
    id: variable.id,
    name: variable.name ?? "",
    value: variable.value ?? "",
    enabled: variable.enabled !== false,
    secret: variable.secret === true
  };
}

function normalizeEnvironment(environment: Environment): Environment {
  return {
    id: environment.id,
    name: (environment.name ?? "").trim() || "Environment",
    variables: (environment.variables ?? []).map(normalizeVariable)
  };
}

function normalizeRawType(rawType: string | undefined): RawType {
  if (rawType === "text" || rawType === "xml") return rawType;
  return "json";
}

function migrateBodyMode(mode: string, form: Pair[]): BodyMode {
  if (mode === "node") {
    return form.some((field) => field.enabled && field.key.trim()) ? "multipart" : "none";
  }
  if (mode === "none" || mode === "multipart" || mode === "form" || mode === "raw" || mode === "binary" || mode === "graphql") return mode;
  return "raw";
}

function normalizeTreeItem(item: TreeItem): TreeItem {
  const parentId = normalizeParentId(item.parentId);
  if (item.kind === "folder") return { ...item, parentId };
  const request = item as SavedRequest & {
    rawType?: RawType;
    lastResponse?: ApiResponse | null;
    lastError?: string | null;
    streamResponse?: boolean;
    bodyMode?: string;
  };
  const form = (request.form ?? []).map((field) => ({
    ...field,
    partType: (field.partType === "file" ? "file" : "text") as FormPartType
  }));
  const description =
    typeof (request as SavedRequest & { description?: string }).description === "string"
      ? (request as SavedRequest & { description?: string }).description!.trim() || undefined
      : undefined;
  const normalized = {
    ...request,
    parentId,
    description,
    bodyMode: migrateBodyMode(String(request.bodyMode ?? "raw"), form),
    rawType: normalizeRawType(request.rawType),
    headers: request.headers ?? [],
    form,
    streamResponse: request.streamResponse ?? false,
    extractor: normalizeRequestExtractor(request.extractor),
    lastResponse: normalizeApiResponse(request.lastResponse),
    lastError: request.lastError ?? null,
    savedResponses: (request.savedResponses ?? []).map(normalizeSavedResponseHistoryItem)
  };
  return hydrateRequestAuth(migrateRequestQuery(normalized));
}

export function normalizeConfig(config: AppConfig): AppConfig {
  const environments = (config.environments ?? []).map(normalizeEnvironment);
  let activeEnvironmentId = config.activeEnvironmentId ?? null;
  if (activeEnvironmentId && !environments.some((env) => env.id === activeEnvironmentId)) {
    activeEnvironmentId = null;
  }
  const normalized: AppConfig = {
    configVersion: CONFIG_VERSION,
    items: (config.items ?? []).map(normalizeTreeItem),
    variables: (config.variables ?? []).map(normalizeVariable),
    environments,
    activeEnvironmentId,
    openTabs: config.openTabs ?? [],
    activeTabId: config.activeTabId ?? "",
    extractors: normalizeExtractors(config),
    helpers: normalizeHelpers(config),
    settings: {
      ...defaultSettings(),
      ...config.settings,
      tabSize: clampTabSize(config.settings?.tabSize),
      autoPrettifyJson: config.settings?.autoPrettifyJson !== false,
      requestTimeoutSecs: clampRequestTimeoutSecs(config.settings?.requestTimeoutSecs),
      scriptTimeoutSecs: clampScriptTimeoutSecs(config.settings?.scriptTimeoutSecs),
      followRedirects: config.settings?.followRedirects !== false,
      clickToSelect: config.settings?.clickToSelect !== false,
      limitOpenTabs: config.settings?.limitOpenTabs === true,
      maxOpenTabs: clampMaxOpenTabs(config.settings?.maxOpenTabs),
      duplicateNaming: normalizeDuplicateNaming(
        config.settings?.duplicateNaming,
        (config.settings as { numberDuplicateNames?: boolean } | undefined)?.numberDuplicateNames
      ),
      proxy: normalizeProxySettings({
        ...defaultSettings().proxy,
        ...(config.settings?.proxy as Record<string, unknown> | undefined)
      }),
      proxyTestUrl:
        typeof config.settings?.proxyTestUrl === "string" && config.settings.proxyTestUrl.trim()
          ? config.settings.proxyTestUrl.trim()
          : DEFAULT_PROXY_TEST_URL
    }
  };

  // Runs after normalization so every field is already the right shape. Idempotent, so an
  // already-migrated config passed through here again is unchanged.
  return needsVariableSyntaxMigration(config.configVersion) ? migrateVariableSyntax(normalized) : normalized;
}


export function isSeedConfig(config: AppConfig) {
  const hasOnlySeedItems =
    config.items.length === 2 &&
    config.items.some((item) => item.kind === "folder" && item.title === "Local") &&
    config.items.some((item) => item.kind === "request" && item.title === "Example" && item.url === "https://httpbin.org/get");
  const hasOnlySeedVariable = config.variables.length <= 1 && (config.variables[0]?.name ?? "base_url") === "base_url";
  return hasOnlySeedItems && hasOnlySeedVariable;
}

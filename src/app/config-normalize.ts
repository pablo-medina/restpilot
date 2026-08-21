import { clampTabSize } from "../types";
import { normalizeProxySettings } from "./proxy-settings";
import { normalizeDuplicateNaming } from "./collection-names";
import { hydrateRequestAuth, normalizeRequestAuth } from "./request-auth";
import { migrateRequestQuery } from "../lib/url-params";
import { normalizeParentId } from "./collection-parent";
import { migrateVariableSyntax, needsVariableSyntaxMigration } from "./migrate-variable-syntax";
import {
  clampRequestTimeoutSecs,
  CONFIG_VERSION,
  DEFAULT_PROXY_TEST_URL,
  defaultSettings,
  type ApiResponse,
  type AppConfig,
  type AppFunction,
  type BodyMode,
  type Environment,
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

function normalizeFunction(func: any): AppFunction {
  const form = (func.form ?? []).map((field: any) => ({
    id: String(field.id || crypto.randomUUID()),
    key: String(field.key ?? ""),
    value: String(field.value ?? ""),
    enabled: field.enabled !== false,
    partType: (field.partType === "file" ? "file" : "text") as FormPartType,
    fileName: field.fileName ? String(field.fileName) : undefined
  }));
  const queryParams = (func.queryParams ?? []).map((field: any) => ({
    id: String(field.id || crypto.randomUUID()),
    key: String(field.key ?? ""),
    value: String(field.value ?? ""),
    enabled: field.enabled !== false
  }));
  const headers = (func.headers ?? []).map((field: any) => ({
    id: String(field.id || crypto.randomUUID()),
    key: String(field.key ?? ""),
    value: String(field.value ?? ""),
    enabled: field.enabled !== false
  }));

  return {
    id: String(func.id),
    name: String(func.name ?? "Function").trim() || "Function",
    description: typeof func.description === "string" ? func.description.trim() || undefined : undefined,
    code: String(func.code ?? ""),
    functionType: (func.functionType === "javascript" ? "javascript" : "http") as "http" | "javascript",
    method: String(func.method ?? "GET"),
    url: String(func.url ?? "https://jsonplaceholder.typicode.com/todos/1"),
    queryParams,
    headers,
    bodyMode: migrateBodyMode(String(func.bodyMode ?? "none"), form),
    rawType: normalizeRawType(func.rawType),
    body: String(func.body ?? ""),
    form,
    auth: normalizeRequestAuth(func.auth),
    extractorCode: String(func.extractorCode ?? `// Extract data from the response\nif (response.status === 200) {\n  return response.body;\n}\nreturn undefined;\n`),
    autoMapEnabled: func.autoMapEnabled === true,
    autoMapVariable: typeof func.autoMapVariable === "string" ? func.autoMapVariable.trim() : "",
    autoMapScope: func.autoMapScope === "environment" ? "environment" : "global",
    lastHttpResponse: normalizeFunctionLastHttp(func),
    lastTestResult: normalizeFunctionLastTestResult(func)
  };
}

function normalizeFunctionLastHttp(func: Record<string, unknown>): AppFunction["lastHttpResponse"] {
  const stored = normalizeApiResponse(func.lastHttpResponse);
  if (stored) return stored;

  const legacy = func.lastTestResult as { responseStatus?: number; responseBody?: string } | null | undefined;
  if (legacy?.responseBody != null && legacy.responseStatus != null) {
    const body = String(legacy.responseBody);
    return {
      status: legacy.responseStatus,
      status_text: "",
      duration_ms: 0,
      headers: [],
      body,
      body_is_base64: false,
      body_size: body.length
    };
  }
  return null;
}

function normalizeFunctionLastTestResult(func: Record<string, unknown>): AppFunction["lastTestResult"] {
  const legacy = func.lastTestResult as AppFunction["lastTestResult"] & {
    responseStatus?: number;
    responseBody?: string;
  };
  if (!legacy || typeof legacy !== "object") return null;
  return {
    success: legacy.success === true,
    extractedValue: legacy.extractedValue,
    error: legacy.error ? String(legacy.error) : undefined
  };
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
    functions: (config.functions ?? []).map(normalizeFunction),
    activeFunctionId: config.activeFunctionId ?? null,
    settings: {
      ...defaultSettings(),
      ...config.settings,
      tabSize: clampTabSize(config.settings?.tabSize),
      autoPrettifyJson: config.settings?.autoPrettifyJson !== false,
      requestTimeoutSecs: clampRequestTimeoutSecs(config.settings?.requestTimeoutSecs),
      followRedirects: config.settings?.followRedirects !== false,
      clickToSelect: config.settings?.clickToSelect !== false,
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

import { clampTabSize } from "../types";
import { normalizeAiSettings } from "./ai-settings";
import { normalizeProxySettings } from "./proxy-settings";
import { normalizeDuplicateNaming } from "./collection-names";
import { hydrateRequestAuth, normalizeRequestAuth } from "./request-auth";
import { migrateRequestQuery } from "../url-params";
import { normalizeParentId } from "./collection-parent";
import {
  clampRequestTimeoutSecs,
  DEFAULT_PROXY_TEST_URL,
  defaultSettings,
  type ApiResponse,
  type AppConfig,
  type AppFunction,
  type BodyMode,
  type Environment,
  type FormPartType,
  type Pair,
  type RawType,
  type SavedRequest,
  type TreeItem,
  type UserSettings,
  type Variable
} from "../types";

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
    functionType: (func.functionType === "ai" ? "ai" : func.functionType === "javascript" ? "javascript" : "http") as "http" | "ai" | "javascript",
    method: String(func.method ?? "GET"),
    url: String(func.url ?? "https://jsonplaceholder.typicode.com/todos/1"),
    queryParams,
    headers,
    bodyMode: migrateBodyMode(String(func.bodyMode ?? "none"), form),
    rawType: normalizeRawType(func.rawType),
    body: String(func.body ?? ""),
    form,
    auth: normalizeRequestAuth(func.auth),
    extractorType: (func.extractorType === "ai" ? "ai" : "javascript") as "javascript" | "ai",
    extractorCode: String(func.extractorCode ?? `// Extract data from the response\nif (response.status === 200) {\n  return response.body;\n}\nreturn undefined;\n`),
    extractorPrompt: func.extractorPrompt ? String(func.extractorPrompt) : "",
    aiRequestPrompt: func.aiRequestPrompt ? String(func.aiRequestPrompt) : "",
    lastHttpResponse: normalizeFunctionLastHttp(func),
    lastTestResult: normalizeFunctionLastTestResult(func)
  };
}

function normalizeFunctionLastHttp(func: Record<string, unknown>): AppFunction["lastHttpResponse"] {
  const stored = func.lastHttpResponse as AppFunction["lastHttpResponse"];
  if (stored && typeof stored === "object" && typeof (stored as { status?: number }).status === "number") {
    return stored;
  }
  const legacy = func.lastTestResult as { responseStatus?: number; responseBody?: string } | null | undefined;
  if (legacy?.responseBody != null && legacy.responseStatus != null) {
    return {
      status: legacy.responseStatus,
      status_text: "",
      duration_ms: 0,
      headers: {},
      body: String(legacy.responseBody)
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
  if (mode === "none" || mode === "multipart" || mode === "form" || mode === "raw") return mode;
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
    lastResponse: request.lastResponse ?? null,
    lastError: request.lastError ?? null
  };
  return hydrateRequestAuth(migrateRequestQuery(normalized));
}

export function normalizeConfig(config: AppConfig): AppConfig {
  const environments = (config.environments ?? []).map(normalizeEnvironment);
  let activeEnvironmentId = config.activeEnvironmentId ?? null;
  if (activeEnvironmentId && !environments.some((env) => env.id === activeEnvironmentId)) {
    activeEnvironmentId = null;
  }
  return {
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
          : DEFAULT_PROXY_TEST_URL,
      ai: normalizeAiSettings(config.settings?.ai)
    }
  };
}


export function isSeedConfig(config: AppConfig) {
  const hasOnlySeedItems =
    config.items.length === 2 &&
    config.items.some((item) => item.kind === "folder" && item.title === "Local") &&
    config.items.some((item) => item.kind === "request" && item.title === "Example" && item.url === "https://httpbin.org/get");
  const hasOnlySeedVariable = config.variables.length <= 1 && (config.variables[0]?.name ?? "base_url") === "base_url";
  return hasOnlySeedItems && hasOnlySeedVariable;
}

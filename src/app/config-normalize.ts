import { clampTabSize } from "../types";
import { normalizeProxySettings } from "./proxy-settings";
import { normalizeDuplicateNaming } from "./collection-names";
import { hydrateRequestAuth } from "./request-auth";
import { migrateRequestQuery } from "../url-params";
import {
  clampRequestTimeoutSecs,
  defaultSettings,
  type ApiResponse,
  type AppConfig,
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
  if (item.kind === "folder") return item;
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
  const normalized = {
    ...request,
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
        typeof config.settings?.proxyTestUrl === "string" ? config.settings.proxyTestUrl : ""
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

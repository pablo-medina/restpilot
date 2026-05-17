import { invoke } from "@tauri-apps/api/core";
import { clampTabSize } from "../large-text-editor";
import { migrateRequestQuery } from "../url-params";
import { setLocale } from "../i18n";
import {
  clampRequestTimeoutSecs,
  defaultConfig,
  defaultSettings,
  type ApiResponse,
  type AppConfig,
  type BodyMode,
  type FormPartType,
  type Pair,
  type RawType,
  type Environment,
  type SavedRequest,
  type TreeItem,
  type UserSettings,
  type Variable
} from "../types";
import { getRequestFrom, state } from "./state";

let saveTimer: number | undefined;

export function proxyPayload(proxy: UserSettings["proxy"]) {
  if (proxy.mode === "none") return null;
  return {
    mode: proxy.mode,
    host: proxy.host.trim() || null,
    port: proxy.port || null,
    username: proxy.username.trim() || null,
    password: proxy.password || null
  };
}

function normalizeVariable(variable: Variable): Variable {
  return {
    id: variable.id,
    name: variable.name ?? "",
    value: variable.value ?? "",
    enabled: variable.enabled !== false
  };
}

function normalizeEnvironment(environment: Environment): Environment {
  return {
    id: environment.id,
    name: (environment.name ?? "").trim() || "Environment",
    variables: (environment.variables ?? []).map(normalizeVariable)
  };
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
      proxy: { ...defaultSettings().proxy, ...config.settings?.proxy }
    }
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
  return migrateRequestQuery(normalized);
}

export function isSeedConfig(config: AppConfig) {
  const hasOnlySeedItems =
    config.items.length === 2 &&
    config.items.some((item) => item.kind === "folder" && item.title === "Local") &&
    config.items.some((item) => item.kind === "request" && item.title === "Example" && item.url === "https://httpbin.org/get");
  const hasOnlySeedVariable = config.variables.length <= 1 && (config.variables[0]?.name ?? "base_url") === "base_url";
  return hasOnlySeedItems && hasOnlySeedVariable;
}

export function applyUserSettings(settings: UserSettings) {
  document.documentElement.dataset.theme = settings.theme;
  setLocale(settings.language);
}

export function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persistConfig, 300);
}

function sanitizeItemsForSave(items: TreeItem[]): TreeItem[] {
  return items.map((item) => {
    if (item.kind !== "request") return item;
    return {
      ...item,
      form: item.form.map((field) =>
        field.partType === "file" ? { ...field, value: "" } : field
      )
    };
  });
}

export async function persistConfig() {
  const config: AppConfig = {
    items: sanitizeItemsForSave(state.items),
    variables: state.variables,
    environments: state.environments,
    activeEnvironmentId: state.activeEnvironmentId,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    settings: state.settings
  };
  await invoke("save_app_config", { config });
}

export async function loadStoredConfig(): Promise<{ config: AppConfig; persist: boolean } | null> {
  const stored = await invoke<AppConfig | null>("load_app_config");
  if (!stored) return null;
  if (stored.items?.length && isSeedConfig(stored)) {
    return { config: defaultConfig(), persist: true };
  }
  return { config: normalizeConfig(stored), persist: false };
}

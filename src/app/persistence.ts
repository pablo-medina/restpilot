import { invoke } from "@tauri-apps/api/core";
import { setLocale } from "../i18n";
import {
  defaultConfig,
  type ApiResponse,
  type AppConfig,
  type SavedResponseHistoryItem,
  type TreeItem,
  type UserSettings
} from "../types";
import { isSeedConfig, normalizeApiResponse, normalizeConfig, normalizeSavedResponseHistoryItem } from "./config-normalize";
import { networkPayload } from "./request-utils";
import { state } from "./state";

let saveTimer: number | undefined;

export { isSeedConfig, normalizeConfig } from "./config-normalize";

export function proxySettingsForSave(proxy: UserSettings["proxy"]): UserSettings["proxy"] {
  return {
    mode: proxy.mode,
    httpProxy: proxy.httpProxy.trim(),
    httpsProxy: proxy.httpsProxy.trim(),
    noProxy: proxy.noProxy.trim(),
    useHttpProxyEnv: proxy.useHttpProxyEnv,
    useHttpsProxyEnv: proxy.useHttpsProxyEnv,
    useNoProxyEnv: proxy.useNoProxyEnv,
    authMode: proxy.authMode
  };
}

export function proxyPayload(proxy: UserSettings["proxy"]) {
  if (proxy.mode === "none") return null;
  return {
    mode: proxy.mode,
    http_proxy: proxy.httpProxy.trim() || null,
    https_proxy: proxy.httpsProxy.trim() || null,
    no_proxy: proxy.noProxy.trim() || null,
    use_http_proxy_env: proxy.useHttpProxyEnv,
    use_https_proxy_env: proxy.useHttpsProxyEnv,
    use_no_proxy_env: proxy.useNoProxyEnv,
    auth_mode: proxy.authMode
  };
}

/** Shared proxy and network options for native HTTP requests. */
export function httpTransportPayload(settings: UserSettings, stream = false) {
  return {
    proxy: proxyPayload(settings.proxy),
    network: networkPayload(settings, stream)
  };
}

export function applyUserSettings(settings: UserSettings) {
  document.documentElement.dataset.theme = settings.theme;
  setLocale(settings.language);
}

export function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persistConfig, 300);
}

/** Response history lives in its own file (see `save_response_cache`) so a
 * handful of large saved responses don't bloat config.json, which gets
 * rewritten on every collection edit. Keyed by request id. */
type ResponseCacheEntry = {
  lastResponse: ApiResponse | null;
  lastError: string | null;
  savedResponses: SavedResponseHistoryItem[];
};
type ResponseCache = Record<string, ResponseCacheEntry>;

function sanitizeItemsForSave(items: TreeItem[]): TreeItem[] {
  return items.map((item) => {
    if (item.kind !== "request") return item;
    return {
      ...item,
      form: item.form.map((field) =>
        field.partType === "file" ? { ...field, value: "" } : field
      ),
      // Response bodies/history are persisted separately — see buildResponseCache.
      lastResponse: null,
      lastError: null,
      savedResponses: undefined
    };
  });
}

function buildResponseCache(items: TreeItem[]): ResponseCache {
  const cache: ResponseCache = {};
  for (const item of items) {
    if (item.kind !== "request") continue;
    const savedResponses = item.savedResponses ?? [];
    if (!item.lastResponse && !item.lastError && savedResponses.length === 0) continue;
    cache[item.id] = {
      lastResponse: item.lastResponse,
      lastError: item.lastError,
      savedResponses
    };
  }
  return cache;
}

export async function persistConfig() {
  const config: AppConfig = {
    items: sanitizeItemsForSave(state.items),
    variables: state.variables,
    environments: state.environments,
    activeEnvironmentId: state.activeEnvironmentId,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    functions: state.functions,
    activeFunctionId: state.activeFunctionId,
    settings: {
      ...state.settings,
      proxy: proxySettingsForSave(state.settings.proxy)
    }
  };
  const cache = buildResponseCache(state.items);
  await Promise.all([
    invoke("save_app_config", { config }),
    invoke("save_response_cache", { cache })
  ]);
}

/** True when any request in `items` still carries response data inline —
 * i.e. a config.json saved before response history moved to its own file. */
function hasEmbeddedResponseData(items: TreeItem[]): boolean {
  return items.some(
    (item) =>
      item.kind === "request" &&
      (item.lastResponse != null || item.lastError != null || (item.savedResponses?.length ?? 0) > 0)
  );
}

function mergeResponseCache(items: TreeItem[], cache: ResponseCache): TreeItem[] {
  return items.map((item) => {
    if (item.kind !== "request") return item;
    const entry = cache[item.id];
    if (!entry) return item;
    return {
      ...item,
      lastResponse: normalizeApiResponse(entry.lastResponse),
      lastError: entry.lastError ?? null,
      savedResponses: (entry.savedResponses ?? []).map((res) =>
        normalizeSavedResponseHistoryItem(res as unknown as Record<string, unknown>)
      )
    };
  });
}

export async function loadStoredConfig(): Promise<{ config: AppConfig; persist: boolean } | null> {
  const stored = await invoke<AppConfig | null>("load_app_config");
  if (!stored) return null;
  if (stored.items?.length && isSeedConfig(stored)) {
    return { config: defaultConfig(), persist: true };
  }

  const config = normalizeConfig(stored);
  const cache = (await invoke<ResponseCache | null>("load_response_cache")) ?? {};
  const migrating = hasEmbeddedResponseData(stored.items ?? []);
  config.items = mergeResponseCache(config.items, cache);

  return { config, persist: migrating };
}

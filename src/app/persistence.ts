import { invoke } from "@tauri-apps/api/core";
import { setLocale } from "../i18n";
import { defaultConfig, type AppConfig, type TreeItem, type UserSettings } from "../types";
import { isSeedConfig, normalizeConfig } from "./config-normalize";
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
    functions: state.functions,
    activeFunctionId: state.activeFunctionId,
    settings: {
      ...state.settings,
      proxy: proxySettingsForSave(state.settings.proxy)
    }
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

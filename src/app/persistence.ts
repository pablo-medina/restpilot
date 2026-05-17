import { invoke } from "@tauri-apps/api/core";
import { setLocale } from "../i18n";
import { defaultConfig, type AppConfig, type TreeItem, type UserSettings } from "../types";
import { isSeedConfig, normalizeConfig } from "./config-normalize";
import { state } from "./state";

let saveTimer: number | undefined;

export { isSeedConfig, normalizeConfig } from "./config-normalize";

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

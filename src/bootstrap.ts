import { invoke } from "@tauri-apps/api/core";
import { loadStoredConfig } from "./app/persistence";
import { setLocale } from "./i18n";

/** Apply theme and locale before the main bundle finishes loading. */
async function applyStartupPrefs() {
  try {
    const prefs = await invoke<{ theme?: string; language?: string }>("load_startup_settings");
    if (prefs.theme === "dark" || prefs.theme === "light") {
      document.documentElement.dataset.theme = prefs.theme;
    }
    if (prefs.language === "en" || prefs.language === "es") {
      setLocale(prefs.language);
    }
  } catch {
    // Offline / non-Tauri: keep index.html prefers-color-scheme hint.
  }
}

void (async () => {
  const configPromise = loadStoredConfig();
  await applyStartupPrefs();
  const { startApp } = await import("./app");
  await startApp(configPromise);
})();

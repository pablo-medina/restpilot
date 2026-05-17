import { invoke } from "@tauri-apps/api/core";
import { loadStoredConfig } from "./app/persistence";
import { setLocale, t } from "./i18n";

function updateBootMessage() {
  const message = document.querySelector<HTMLElement>(".app-boot-message");
  if (message) message.textContent = t().app.loading;
}

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
    // Non-Tauri: keep light splash from index.html.
  }
  updateBootMessage();
}

void (async () => {
  const configPromise = loadStoredConfig();
  await applyStartupPrefs();
  const { startApp } = await import("./app");
  await startApp(configPromise);
})();

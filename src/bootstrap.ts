import { invoke } from "@tauri-apps/api/core";
import { loadStoredConfig } from "./app/persistence";
import { setLocale, t } from "./i18n";
// Static imports on purpose: this is a desktop app served from a local protocol, so the
// whole UI bundle is one parallel fetch that Vite can `modulepreload` from index.html.
// A dynamic import() here would hide these chunks from the HTML and serialize the load
// (entry → IPC → react chunk → app chunk → stylesheet), which is what left the window
// blank for seconds in release builds.
import "./styles.css";
import { mountReactApp } from "./react/main";
import { startApp } from "./app";

type StartupPrefs = { theme?: string; language?: string };

function updateBootMessage() {
  const message = document.querySelector<HTMLElement>(".app-boot-message");
  if (message) message.textContent = t().app.loading;
}

async function applyStartupPrefs(prefsPromise: Promise<StartupPrefs>) {
  try {
    const prefs = await prefsPromise;
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
  // Both reads are fired before any awaiting so the two IPC round trips overlap
  // with each other instead of running back to back.
  const prefsPromise = invoke<StartupPrefs>("load_startup_settings");
  const configPromise = loadStoredConfig();
  await applyStartupPrefs(prefsPromise);
  mountReactApp();
  await startApp(configPromise);
})();

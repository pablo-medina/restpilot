import { t } from "./i18n";
import { clampRequestTimeoutSecs, type UserSettings } from "./types";

export function renderSettings(settings: UserSettings): string {
  const labels = t().settings;
  const manualOpen = settings.proxy.mode === "manual";
  const closeLabel = t().dialog.close;

  return `
    <section class="settings-view">
      <div class="panel-close-sticky">
        <button class="mini-btn panel-close-btn" id="settings-back" type="button" title="${closeLabel}" aria-label="${closeLabel}">×</button>
      </div>
      <header class="settings-header">
        <h1>${labels.title}</h1>
        <p>${labels.subtitle}</p>
      </header>

      <div class="settings-grid">
        <section class="settings-card">
          <h2>${labels.appearance}</h2>
          <label class="settings-field">
            <span>${labels.theme}</span>
            <select id="setting-theme">
              <option value="light" ${settings.theme === "light" ? "selected" : ""}>${labels.themeLight}</option>
              <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>${labels.themeDark}</option>
            </select>
          </label>
        </section>

        <section class="settings-card">
          <h2>${labels.windowSection}</h2>
          <label class="settings-field settings-toggle">
            <span>${labels.maximizeOnStartup}</span>
            <input id="setting-maximize-on-startup" type="checkbox" ${settings.maximizeOnStartup ? "checked" : ""} />
          </label>
        </section>

        <section class="settings-card settings-editing-card">
          <h2>${labels.editingSection}</h2>
          <div class="settings-options">
            <div class="settings-option">
              <label class="settings-field">
                <span class="settings-option-label">${labels.tabSize}</span>
                <input id="setting-tab-size" type="number" min="1" max="8" step="1" value="${settings.tabSize}" />
              </label>
              <p class="settings-option-hint">${labels.tabSizeHint}</p>
            </div>
            <div class="settings-option">
              <label class="settings-toggle-row" for="setting-auto-prettify-json">
                <span class="settings-option-label">${labels.autoPrettifyJson}</span>
                <input id="setting-auto-prettify-json" type="checkbox" ${settings.autoPrettifyJson ? "checked" : ""} />
              </label>
              <p class="settings-option-hint">${labels.autoPrettifyJsonHint}</p>
            </div>
            <div class="settings-option">
              <label class="settings-toggle-row" for="setting-click-to-select">
                <span class="settings-option-label">${labels.clickToSelect}</span>
                <input id="setting-click-to-select" type="checkbox" ${settings.clickToSelect ? "checked" : ""} />
              </label>
              <p class="settings-option-hint">${labels.clickToSelectHint}</p>
            </div>
          </div>
        </section>

        <section class="settings-card">
          <h2>${labels.languageSection}</h2>
          <label class="settings-field">
            <span>${labels.language}</span>
            <select id="setting-language">
              <option value="en" ${settings.language === "en" ? "selected" : ""}>${labels.languageEn}</option>
              <option value="es" ${settings.language === "es" ? "selected" : ""}>${labels.languageEs}</option>
            </select>
          </label>
        </section>

        <section class="settings-card settings-card-wide">
          <h2>${labels.network}</h2>
          <label class="settings-field">
            <span>${labels.proxy}</span>
            <select id="setting-proxy-mode">
              <option value="none" ${settings.proxy.mode === "none" ? "selected" : ""}>${labels.proxyNone}</option>
              <option value="system" ${settings.proxy.mode === "system" ? "selected" : ""}>${labels.proxySystem}</option>
              <option value="manual" ${settings.proxy.mode === "manual" ? "selected" : ""}>${labels.proxyManual}</option>
            </select>
          </label>
          <label class="settings-field">
            <span>${labels.requestTimeout}</span>
            <input id="setting-request-timeout" type="number" min="5" max="300" step="1" value="${settings.requestTimeoutSecs}" />
          </label>
          <p class="hint settings-field-hint">${labels.requestTimeoutHint}</p>
          <label class="settings-field settings-toggle">
            <span>${labels.followRedirects}</span>
            <input id="setting-follow-redirects" type="checkbox" ${settings.followRedirects ? "checked" : ""} />
          </label>
          <p class="hint settings-field-hint">${labels.followRedirectsHint}</p>
          <div class="settings-proxy-manual ${manualOpen ? "open" : ""}" id="proxy-manual-fields">
            <label class="settings-field">
              <span>${labels.proxyHost}</span>
              <input id="setting-proxy-host" value="${escapeAttribute(settings.proxy.host)}" spellcheck="false" />
            </label>
            <label class="settings-field">
              <span>${labels.proxyPort}</span>
              <input id="setting-proxy-port" type="number" min="1" max="65535" value="${settings.proxy.port}" />
            </label>
            <label class="settings-field">
              <span>${labels.proxyUsername}</span>
              <input id="setting-proxy-username" value="${escapeAttribute(settings.proxy.username)}" spellcheck="false" autocomplete="off" />
            </label>
            <label class="settings-field">
              <span>${labels.proxyPassword}</span>
              <input id="setting-proxy-password" type="password" value="${escapeAttribute(settings.proxy.password)}" autocomplete="off" />
            </label>
          </div>
        </section>

        <section class="settings-card settings-card-wide">
          <h2>${labels.shortcutsSection}</h2>
          <dl class="settings-shortcuts">
            <div><dt>${labels.shortcutSend}</dt><dd><kbd>${labels.shortcutSendKeys}</kbd></dd></div>
            <div><dt>${labels.shortcutCloseTab}</dt><dd><kbd>${labels.shortcutCloseTabKeys}</kbd></dd></div>
            <div><dt>${labels.shortcutFocusUrl}</dt><dd><kbd>${labels.shortcutFocusUrlKeys}</kbd></dd></div>
            <div><dt>${labels.shortcutFormatJson}</dt><dd><kbd>${labels.shortcutFormatJsonKeys}</kbd></dd></div>
            <div><dt>${labels.shortcutUndo}</dt><dd><kbd>${labels.shortcutUndoKeys}</kbd></dd></div>
            <div><dt>${labels.shortcutRedo}</dt><dd><kbd>${labels.shortcutRedoKeys}</kbd></dd></div>
            <div><dt>${labels.shortcutContextMenu}</dt><dd><kbd>${labels.shortcutContextMenuKeys}</kbd></dd></div>
            <div><dt>${labels.shortcutTreeNav}</dt><dd>${labels.shortcutTreeNavKeys}</dd></div>
          </dl>
        </section>

        <section class="settings-card settings-card-wide about-card">
          <h2>${labels.about}</h2>
          <dl class="about-list">
            <div><dt>${labels.aboutAuthor}</dt><dd>Pablo Medina</dd></div>
            <div><dt>${labels.aboutDescription}</dt><dd>${labels.aboutText}</dd></div>
            <div><dt>${labels.aboutLicense}</dt><dd>${labels.licenseMit}</dd></div>
          </dl>
        </section>

        <section class="settings-card settings-card-wide settings-danger-card">
          <h2>${labels.data}</h2>
          <p class="settings-danger-copy">${labels.clearDataBody}</p>
          <button class="danger-button settings-clear-btn" id="clear-all-data" type="button">${labels.clearData}</button>
        </section>
      </div>
    </section>
  `;
}

export function bindSettings(
  settings: UserSettings,
  onChange: () => void,
  onBack: () => void,
  onClearAll: () => void
) {
  document.querySelector("#settings-back")?.addEventListener("click", onBack);
  document.querySelector("#clear-all-data")?.addEventListener("click", onClearAll);

  document.querySelector<HTMLSelectElement>("#setting-theme")?.addEventListener("change", (event) => {
    settings.theme = (event.target as HTMLSelectElement).value as UserSettings["theme"];
    onChange();
  });

  document.querySelector<HTMLInputElement>("#setting-maximize-on-startup")?.addEventListener("change", (event) => {
    settings.maximizeOnStartup = (event.target as HTMLInputElement).checked;
    onChange();
  });

  document.querySelector<HTMLInputElement>("#setting-tab-size")?.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const parsed = Number(input.value);
    settings.tabSize = Number.isFinite(parsed) ? Math.max(1, Math.min(8, Math.round(parsed))) : 2;
    input.value = String(settings.tabSize);
    onChange();
  });

  document.querySelector<HTMLInputElement>("#setting-auto-prettify-json")?.addEventListener("change", (event) => {
    settings.autoPrettifyJson = (event.target as HTMLInputElement).checked;
    onChange();
  });

  document.querySelector<HTMLInputElement>("#setting-click-to-select")?.addEventListener("change", (event) => {
    settings.clickToSelect = (event.target as HTMLInputElement).checked;
    onChange();
  });

  document.querySelector<HTMLSelectElement>("#setting-language")?.addEventListener("change", (event) => {
    settings.language = (event.target as HTMLSelectElement).value as UserSettings["language"];
    onChange();
  });

  document.querySelector<HTMLInputElement>("#setting-request-timeout")?.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    settings.requestTimeoutSecs = clampRequestTimeoutSecs(input.value);
    input.value = String(settings.requestTimeoutSecs);
    onChange();
  });

  document.querySelector<HTMLInputElement>("#setting-follow-redirects")?.addEventListener("change", (event) => {
    settings.followRedirects = (event.target as HTMLInputElement).checked;
    onChange();
  });

  document.querySelector<HTMLSelectElement>("#setting-proxy-mode")?.addEventListener("change", (event) => {
    settings.proxy.mode = (event.target as HTMLSelectElement).value as UserSettings["proxy"]["mode"];
    document.querySelector("#proxy-manual-fields")?.classList.toggle("open", settings.proxy.mode === "manual");
    onChange();
  });

  document.querySelector<HTMLInputElement>("#setting-proxy-host")?.addEventListener("input", (event) => {
    settings.proxy.host = (event.target as HTMLInputElement).value;
    onChange();
  });
  document.querySelector<HTMLInputElement>("#setting-proxy-port")?.addEventListener("input", (event) => {
    settings.proxy.port = Number((event.target as HTMLInputElement).value) || 8080;
    onChange();
  });
  document.querySelector<HTMLInputElement>("#setting-proxy-username")?.addEventListener("input", (event) => {
    settings.proxy.username = (event.target as HTMLInputElement).value;
    onChange();
  });
  document.querySelector<HTMLInputElement>("#setting-proxy-password")?.addEventListener("input", (event) => {
    settings.proxy.password = (event.target as HTMLInputElement).value;
    onChange();
  });
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/`/g, "&#096;");
}

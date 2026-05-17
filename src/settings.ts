import { invoke } from "@tauri-apps/api/core";
import { proxyPayload, scheduleSave } from "./app/persistence";
import { t } from "./i18n";
import { clampRequestTimeoutSecs, type UserSettings } from "./types";

const proxyUrlRevealed = { http: false, https: false };

export function renderSettings(settings: UserSettings): string {
  const labels = t().settings;
  const manualOpen = settings.proxy.mode === "manual";
  const proxyAdvancedOpen = settings.proxy.mode !== "none";
  const systemProxy = settings.proxy.mode === "system";
  const closeLabel = t().dialog.close;

  return `
    <section class="settings-view">
      <div class="panel-close-sticky">
        <button class="mini-btn panel-close-btn" id="settings-back" type="button" title="${closeLabel}" aria-label="${closeLabel}">×</button>
      </div>
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

        <section class="settings-card settings-collections-card">
          <h2>${labels.collectionsSection}</h2>
          <fieldset class="settings-duplicate-naming">
              <legend class="settings-option-label">${labels.duplicateNamingSection}</legend>
              <label class="settings-radio-row">
                <input type="radio" name="duplicate-naming" value="original" ${settings.duplicateNaming === "original" ? "checked" : ""} />
                <span>${labels.duplicateNamingOriginal}</span>
              </label>
              <label class="settings-radio-row">
                <input type="radio" name="duplicate-naming" value="copyOf" ${settings.duplicateNaming === "copyOf" ? "checked" : ""} />
                <span>${labels.duplicateNamingCopyOf}</span>
              </label>
              <label class="settings-radio-row">
                <input type="radio" name="duplicate-naming" value="numbered" ${settings.duplicateNaming === "numbered" ? "checked" : ""} />
                <span>${labels.duplicateNamingNumbered}</span>
              </label>
          </fieldset>
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
          <div class="settings-proxy-advanced ${proxyAdvancedOpen ? "open" : ""}" id="proxy-advanced-fields">
            <label class="settings-field">
              <span>${labels.proxyAuth}</span>
              <select id="setting-proxy-auth" ${proxyAdvancedOpen ? "" : "disabled"}>
                <option value="auto" ${settings.proxy.authMode === "auto" ? "selected" : ""}>${labels.proxyAuthAuto}</option>
                <option value="basic" ${settings.proxy.authMode === "basic" ? "selected" : ""}>${labels.proxyAuthBasic}</option>
                <option value="ntlm" ${settings.proxy.authMode === "ntlm" ? "selected" : ""}>${labels.proxyAuthNtlm}</option>
                <option value="negotiate" ${settings.proxy.authMode === "negotiate" ? "selected" : ""}>${labels.proxyAuthNegotiate}</option>
              </select>
            </label>
            <label class="settings-field settings-toggle">
              <span>${labels.proxyCurlSystem}</span>
              <input id="setting-proxy-curl-system" type="checkbox" ${settings.proxy.useCurlForSystem ? "checked" : ""} ${systemProxy ? "" : "disabled"} />
            </label>
          </div>
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
              <span>${labels.proxyHttp}</span>
              ${renderProxyUrlField(
                "setting-proxy-http",
                "toggle-proxy-http",
                settings.proxy.httpProxy,
                labels.proxyUrlPlaceholder,
                proxyUrlRevealed.http,
                labels.proxyUrlShow,
                labels.proxyUrlHide
              )}
            </label>
            <label class="settings-field">
              <span>${labels.proxyHttps}</span>
              ${renderProxyUrlField(
                "setting-proxy-https",
                "toggle-proxy-https",
                settings.proxy.httpsProxy,
                labels.proxyUrlPlaceholder,
                proxyUrlRevealed.https,
                labels.proxyUrlShow,
                labels.proxyUrlHide
              )}
            </label>
            <p class="hint settings-field-hint">${labels.proxyHttpsOnlyHint}</p>
          </div>
          <label class="settings-field settings-proxy-test">
            <span>${labels.proxyTestUrl}</span>
            <div class="settings-proxy-test-row">
              <input id="setting-proxy-test-url" type="url" value="${escapeAttribute(settings.proxyTestUrl)}" placeholder="${labels.proxyTestUrlPlaceholder}" spellcheck="false" />
              <button class="settings-proxy-test-btn" id="proxy-test-btn" type="button">${labels.proxyTest}</button>
            </div>
          </label>
          <p class="hint settings-field-hint settings-proxy-test-result" id="proxy-test-result" hidden></p>
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

function renderProxyUrlField(
  inputId: string,
  toggleId: string,
  value: string,
  placeholder: string,
  revealed: boolean,
  showLabel: string,
  hideLabel: string
) {
  const inputType = revealed ? "text" : "password";
  const toggleClass = revealed ? "mini-btn settings-secret-toggle is-revealed" : "mini-btn settings-secret-toggle";
  const toggleLabel = revealed ? hideLabel : showLabel;
  return `
    <div class="settings-secret-input-row">
      <input id="${inputId}" type="${inputType}" value="${escapeAttribute(value)}" placeholder="${escapeAttribute(placeholder)}" spellcheck="false" autocomplete="off" />
      <button class="${toggleClass}" id="${toggleId}" type="button" title="${escapeAttribute(toggleLabel)}" aria-label="${escapeAttribute(toggleLabel)}">👁</button>
    </div>
  `;
}

function syncProxyUrlReveal(inputId: string, toggleId: string, revealed: boolean) {
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
  const toggle = document.querySelector<HTMLButtonElement>(`#${toggleId}`);
  if (!input || !toggle) return;
  input.type = revealed ? "text" : "password";
  toggle.classList.toggle("is-revealed", revealed);
  const labels = t().settings;
  toggle.title = revealed ? labels.proxyUrlHide : labels.proxyUrlShow;
  toggle.setAttribute("aria-label", revealed ? labels.proxyUrlHide : labels.proxyUrlShow);
}

function syncProxyPanels(settings: UserSettings) {
  const manual = settings.proxy.mode === "manual";
  const advanced = settings.proxy.mode !== "none";
  const system = settings.proxy.mode === "system";
  document.querySelector("#proxy-manual-fields")?.classList.toggle("open", manual);
  document.querySelector("#proxy-advanced-fields")?.classList.toggle("open", advanced);
  const authSelect = document.querySelector<HTMLSelectElement>("#setting-proxy-auth");
  if (authSelect) authSelect.disabled = !advanced;
  const curlCheckbox = document.querySelector<HTMLInputElement>("#setting-proxy-curl-system");
  if (curlCheckbox) curlCheckbox.disabled = !system;
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

  document.querySelectorAll<HTMLInputElement>('input[name="duplicate-naming"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      settings.duplicateNaming = input.value as UserSettings["duplicateNaming"];
      onChange();
    });
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
    syncProxyPanels(settings);
    clearProxyTestResult();
    onChange();
  });

  document.querySelector<HTMLSelectElement>("#setting-proxy-auth")?.addEventListener("change", (event) => {
    settings.proxy.authMode = (event.target as HTMLSelectElement).value as UserSettings["proxy"]["authMode"];
    clearProxyTestResult();
    onChange();
  });

  document.querySelector<HTMLInputElement>("#setting-proxy-curl-system")?.addEventListener("change", (event) => {
    settings.proxy.useCurlForSystem = (event.target as HTMLInputElement).checked;
    clearProxyTestResult();
    onChange();
  });

  document.querySelector("#proxy-test-btn")?.addEventListener("click", () => {
    void runProxyTest(settings);
  });

  document.querySelector<HTMLInputElement>("#setting-proxy-http")?.addEventListener("input", (event) => {
    settings.proxy.httpProxy = (event.target as HTMLInputElement).value;
    onChange();
  });
  document.querySelector<HTMLInputElement>("#setting-proxy-https")?.addEventListener("input", (event) => {
    settings.proxy.httpsProxy = (event.target as HTMLInputElement).value;
    onChange();
  });

  document.querySelector("#toggle-proxy-http")?.addEventListener("click", () => {
    proxyUrlRevealed.http = !proxyUrlRevealed.http;
    syncProxyUrlReveal("setting-proxy-http", "toggle-proxy-http", proxyUrlRevealed.http);
  });
  document.querySelector("#toggle-proxy-https")?.addEventListener("click", () => {
    proxyUrlRevealed.https = !proxyUrlRevealed.https;
    syncProxyUrlReveal("setting-proxy-https", "toggle-proxy-https", proxyUrlRevealed.https);
  });

  document.querySelector<HTMLInputElement>("#setting-proxy-test-url")?.addEventListener("input", (event) => {
    settings.proxyTestUrl = (event.target as HTMLInputElement).value;
    onChange();
  });
}

type ProxyTestResult = {
  ok: boolean;
  status?: number | null;
  duration_ms: number;
  error?: string | null;
  hint?: string | null;
  detail?: string | null;
};

function clearProxyTestResult() {
  const result = document.querySelector<HTMLElement>("#proxy-test-result");
  if (!result) return;
  result.hidden = true;
  result.textContent = "";
  result.classList.remove("is-success", "is-error");
}

async function runProxyTest(settings: UserSettings) {
  const labels = t().settings;
  const button = document.querySelector<HTMLButtonElement>("#proxy-test-btn");
  const result = document.querySelector<HTMLElement>("#proxy-test-result");
  const urlInput = document.querySelector<HTMLInputElement>("#setting-proxy-test-url");
  if (!button || !result) return;

  if (urlInput) {
    settings.proxyTestUrl = urlInput.value;
    scheduleSave();
  }

  button.disabled = true;
  button.textContent = labels.proxyTesting;
  result.hidden = false;
  result.classList.remove("is-success", "is-error");
  result.textContent = labels.proxyTesting;

  try {
    const response = await invoke<ProxyTestResult>("test_proxy_connection", {
      payload: {
        proxy: proxyPayload(settings.proxy),
        url: urlInput?.value.trim() || settings.proxyTestUrl.trim() || null,
        timeout_secs: settings.requestTimeoutSecs
      }
    });

    if (response.ok) {
      result.classList.add("is-success");
      result.textContent = labels.proxyTestSuccess
        .replace("{status}", String(response.status ?? ""))
        .replace("{ms}", String(response.duration_ms));
    } else {
      result.classList.add("is-error");
      const lines = [response.error ?? labels.proxyTestFailedUnknown];
      if (response.hint) lines.push(response.hint);
      if (response.detail) lines.push(response.detail);
      result.textContent = lines.join("\n");
    }
  } catch (error) {
    result.classList.add("is-error");
    result.textContent = labels.proxyTestFailed.replace(
      "{error}",
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    button.disabled = false;
    button.textContent = labels.proxyTest;
  }
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

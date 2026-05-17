import { invoke } from "@tauri-apps/api/core";
import { proxyAuthModeForModeChange } from "./app/proxy-settings";
import { proxyPayload, scheduleSave } from "./app/persistence";
import { applicationDialog } from "./components/dialogs";
import { t } from "./i18n";
import { hiddenClass, setVisible } from "./ui/visibility";
import { clampRequestTimeoutSecs, DEFAULT_PROXY_TEST_URL, type UserSettings } from "./types";

const proxyUrlRevealed = { http: false, https: false };
let lastProxyTestResult: ProxyTestResult | null = null;

export function renderSettings(settings: UserSettings): string {
  const labels = t().settings;
  const manualOpen = settings.proxy.mode === "manual";
  const proxyAuthOpen = settings.proxy.mode !== "none";
  const proxyTestUrl = settings.proxyTestUrl.trim() || DEFAULT_PROXY_TEST_URL;
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

        <section class="settings-card settings-card-wide settings-network-card">
          <h2>${labels.network}</h2>

          <div class="settings-network-general">
            <label class="settings-field settings-field-compact">
              <span>${labels.requestTimeout}</span>
              <input id="setting-request-timeout" type="number" min="5" max="300" step="1" value="${settings.requestTimeoutSecs}" title="${escapeAttribute(labels.requestTimeoutHint)}" />
            </label>
            <label class="settings-toggle-row settings-network-toggle" for="setting-follow-redirects">
              <span>${labels.followRedirects}</span>
              <input id="setting-follow-redirects" type="checkbox" ${settings.followRedirects ? "checked" : ""} title="${escapeAttribute(labels.followRedirectsHint)}" />
            </label>
          </div>

          <div class="settings-network-proxy">
            <div class="settings-proxy-head">
              <label class="settings-field">
                <span>${labels.proxy}</span>
                <select id="setting-proxy-mode">
                  <option value="none" ${settings.proxy.mode === "none" ? "selected" : ""}>${labels.proxyNone}</option>
                  <option value="system" ${settings.proxy.mode === "system" ? "selected" : ""}>${labels.proxySystem}</option>
                  <option value="manual" ${settings.proxy.mode === "manual" ? "selected" : ""}>${labels.proxyManual}</option>
                </select>
              </label>
              <label class="settings-field">
                <span>${labels.proxyAuth}</span>
                <select id="setting-proxy-auth" ${proxyAuthOpen ? "" : "disabled"}>
                  <option value="auto" ${settings.proxy.authMode === "auto" ? "selected" : ""}>${labels.proxyAuthAuto}</option>
                  <option value="basic" ${settings.proxy.authMode === "basic" ? "selected" : ""}>${labels.proxyAuthBasic}</option>
                  <option value="ntlm" ${settings.proxy.authMode === "ntlm" ? "selected" : ""}>${labels.proxyAuthNtlm}</option>
                  <option value="negotiate" ${settings.proxy.authMode === "negotiate" ? "selected" : ""}>${labels.proxyAuthNegotiate}</option>
                </select>
              </label>
            </div>
            <div class="settings-proxy-urls ${manualOpen ? "open" : ""}" id="proxy-url-fields">
              <label class="settings-field">
                <span>${labels.proxyHttp}</span>
                ${renderProxyUrlField(
                  "setting-proxy-http",
                  "toggle-proxy-http",
                  settings.proxy.httpProxy,
                  labels.proxyUrlPlaceholder,
                  proxyUrlRevealed.http,
                  labels.proxyUrlShow,
                  labels.proxyUrlHide,
                  !manualOpen
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
                  labels.proxyUrlHide,
                  !manualOpen
                )}
              </label>
              <label class="settings-field">
                <span>${labels.proxyBypass}</span>
                <input id="setting-proxy-no-proxy" type="text" value="${escapeAttribute(settings.proxy.noProxy)}" placeholder="${escapeAttribute(labels.proxyBypassPlaceholder)}" spellcheck="false" />
              </label>
            </div>
            <label class="settings-field settings-proxy-test">
              <span>${labels.proxyTestUrl}</span>
              <div class="settings-proxy-test-row">
                <input id="setting-proxy-test-url" type="url" value="${escapeAttribute(proxyTestUrl)}" placeholder="${labels.proxyTestUrlPlaceholder}" spellcheck="false" />
                <button class="settings-proxy-test-btn" id="proxy-test-btn" type="button">${labels.proxyTest}</button>
              </div>
              <div class="settings-proxy-test-outcome${hiddenClass(true)}" id="proxy-test-outcome">
                <span class="settings-proxy-test-summary" id="proxy-test-summary"></span>
              </div>
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

function renderProxyUrlField(
  inputId: string,
  toggleId: string,
  value: string,
  placeholder: string,
  revealed: boolean,
  showLabel: string,
  hideLabel: string,
  disabled = false
) {
  const inputType = revealed ? "text" : "password";
  const toggleClass = revealed ? "mini-btn settings-secret-toggle is-revealed" : "mini-btn settings-secret-toggle";
  const toggleLabel = revealed ? hideLabel : showLabel;
  const disabledAttr = disabled ? "disabled" : "";
  return `
    <div class="settings-secret-input-row">
      <input id="${inputId}" type="${inputType}" value="${escapeAttribute(value)}" placeholder="${escapeAttribute(placeholder)}" spellcheck="false" autocomplete="off" ${disabledAttr} />
      <button class="${toggleClass}" id="${toggleId}" type="button" title="${escapeAttribute(toggleLabel)}" aria-label="${escapeAttribute(toggleLabel)}" ${disabled ? "disabled" : ""}>👁</button>
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
  const authOpen = settings.proxy.mode !== "none";
  document.querySelector("#proxy-url-fields")?.classList.toggle("open", manual);

  const authSelect = document.querySelector<HTMLSelectElement>("#setting-proxy-auth");
  if (authSelect) authSelect.disabled = !authOpen;
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
    const mode = (event.target as HTMLSelectElement).value as UserSettings["proxy"]["mode"];
    settings.proxy.authMode = proxyAuthModeForModeChange(mode, settings.proxy.authMode);
    settings.proxy.mode = mode;
    syncProxyPanels(settings);
    onChange();
  });

  document.querySelector<HTMLSelectElement>("#setting-proxy-auth")?.addEventListener("change", (event) => {
    settings.proxy.authMode = (event.target as HTMLSelectElement).value as UserSettings["proxy"]["authMode"];
    onChange();
  });

  document.querySelector("#proxy-test-btn")?.addEventListener("click", () => {
    void runProxyTest(settings);
  });

  document.querySelector("#proxy-test-outcome")?.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).id !== "proxy-test-details-btn" || !lastProxyTestResult) return;
    void showProxyTestLogDialog(lastProxyTestResult);
  });

  document.querySelector<HTMLInputElement>("#setting-proxy-http")?.addEventListener("input", (event) => {
    settings.proxy.httpProxy = (event.target as HTMLInputElement).value;
    onChange();
  });
  document.querySelector<HTMLInputElement>("#setting-proxy-https")?.addEventListener("input", (event) => {
    settings.proxy.httpsProxy = (event.target as HTMLInputElement).value;
    onChange();
  });
  document.querySelector<HTMLInputElement>("#setting-proxy-no-proxy")?.addEventListener("input", (event) => {
    settings.proxy.noProxy = (event.target as HTMLInputElement).value;
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

  const testUrlInput = document.querySelector<HTMLInputElement>("#setting-proxy-test-url");
  testUrlInput?.addEventListener("input", (event) => {
    settings.proxyTestUrl = (event.target as HTMLInputElement).value;
    onChange();
  });
  testUrlInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void runProxyTest(settings);
  });
}

type ProxyTestResult = {
  ok: boolean;
  status?: number | null;
  duration_ms: number;
  error?: string | null;
  hint?: string | null;
  log?: string[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function proxyTestLogHtml(response: ProxyTestResult) {
  const lines = response.log?.length ? response.log : [response.error ?? ""];
  return `<pre class="proxy-test-log">${lines.map((line) => escapeHtml(line)).join("\n")}</pre>`;
}

function formatProxyTestBrief(response: ProxyTestResult, labels: ReturnType<typeof t>["settings"]) {
  if (response.ok) {
    return labels.proxyTestOk
      .replace("{status}", String(response.status ?? "—"))
      .replace("{ms}", String(response.duration_ms));
  }
  const err = (response.error ?? labels.proxyTestFailedUnknown).trim();
  const shortErr = err.length > 72 ? `${err.slice(0, 69)}…` : err;
  return labels.proxyTestFailBrief
    .replace("{status}", response.status != null ? String(response.status) : "—")
    .replace("{error}", shortErr);
}

function removeProxyTestDetailsButton() {
  document.querySelector("#proxy-test-details-btn")?.remove();
}

function mountProxyTestDetailsButton(label: string) {
  const outcome = document.querySelector<HTMLElement>("#proxy-test-outcome");
  if (!outcome || document.querySelector("#proxy-test-details-btn")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = "proxy-test-details-btn";
  button.className = "settings-proxy-test-details-link";
  button.textContent = label;
  outcome.appendChild(button);
}

function showProxyTestOutcome(response: ProxyTestResult) {
  const labels = t().settings;
  const outcome = document.querySelector<HTMLElement>("#proxy-test-outcome");
  const summary = document.querySelector<HTMLElement>("#proxy-test-summary");
  if (!outcome || !summary) return;

  lastProxyTestResult = response;
  summary.textContent = formatProxyTestBrief(response, labels);
  summary.classList.toggle("is-success", response.ok);
  summary.classList.toggle("is-error", !response.ok);

  removeProxyTestDetailsButton();
  if (response.log?.length) {
    mountProxyTestDetailsButton(labels.proxyTestDetails);
  }

  setVisible(outcome, true);
}

async function showProxyTestLogDialog(response: ProxyTestResult) {
  await applicationDialog({
    title: t().settings.proxyTestLogTitle,
    body: "",
    mode: "proxy-test-log",
    previewHtml: proxyTestLogHtml(response),
    resizable: true,
    width: 560,
    height: 420,
    actions: [{ id: "close", label: t().dialog.close, role: "primary" }]
  });
}

async function runProxyTest(settings: UserSettings) {
  const labels = t().settings;
  const button = document.querySelector<HTMLButtonElement>("#proxy-test-btn");
  const urlInput = document.querySelector<HTMLInputElement>("#setting-proxy-test-url");
  if (!button) return;

  if (urlInput) {
    settings.proxyTestUrl = urlInput.value;
    scheduleSave();
  }

  button.disabled = true;
  button.textContent = labels.proxyTesting;
  removeProxyTestDetailsButton();
  setVisible(document.querySelector<HTMLElement>("#proxy-test-outcome"), false);

  try {
    const response = await invoke<ProxyTestResult>("test_proxy_connection", {
      payload: {
        proxy: proxyPayload(settings.proxy),
        url: urlInput?.value.trim() || settings.proxyTestUrl.trim() || null,
        timeout_secs: settings.requestTimeoutSecs
      }
    });
    showProxyTestOutcome(response);
  } catch (error) {
    showProxyTestOutcome({
      ok: false,
      duration_ms: 0,
      error: error instanceof Error ? error.message : String(error),
      log: [error instanceof Error ? error.message : String(error)]
    });
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

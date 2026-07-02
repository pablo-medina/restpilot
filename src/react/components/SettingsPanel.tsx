import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { proxyAuthModeForModeChange } from "../../app/proxy-settings";
import { applyUserSettings, persistConfig, proxyPayload, scheduleSave } from "../../app/persistence";
import { resetAppStateToDefaults } from "../../app/reset-app-state";
import { state } from "../../app/state";
import { applicationDialog, messageDialog } from "../../components/dialogs";
import { iconEye, iconEyeOff } from "../../lib/icons";
import { t } from "../../i18n";
import { clampRequestTimeoutSecs, DEFAULT_PROXY_TEST_URL, type UserSettings } from "../../types";
import { resetSettingsSessionState, type SettingsTabId } from "../../lib/settings";

type Props = {
  refresh: () => void;
};

type ProxyTestResult = {
  ok: boolean;
  status?: number | null;
  duration_ms: number;
  error?: string | null;
  hint?: string | null;
  log?: string[];
};

function ProxyUrlField({
  inputId,
  value,
  placeholder,
  revealed,
  disabled,
  onChange,
  onToggleReveal,
  onClear
}: {
  inputId: string;
  value: string;
  placeholder: string;
  revealed: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onToggleReveal: () => void;
  onClear: () => void;
}) {
  const labels = t();
  const clearLabel = labels.request.clear;
  const toggleLabel = revealed ? labels.settings.proxyUrlHide : labels.settings.proxyUrlShow;
  return (
    <div className="settings-input-shell settings-input-shell--secret">
      <input
        id={inputId}
        type={revealed ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="settings-input-trailing">
        <button
          className="mini-btn field-remove-btn settings-input-clear"
          type="button"
          title={clearLabel}
          aria-label={clearLabel}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
        >
          ×
        </button>
        <button
          className="mini-btn settings-secret-toggle"
          type="button"
          title={toggleLabel}
          aria-label={toggleLabel}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleReveal();
          }}
          dangerouslySetInnerHTML={{ __html: revealed ? iconEyeOff : iconEye }}
        />
      </div>
    </div>
  );
}

export function SettingsPanel({ refresh }: Props) {
  const settings = state.settings;
  const labels = t().settings;
  const clearFieldLabel = t().request.clear;
  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [proxyHttpRevealed, setProxyHttpRevealed] = useState(false);
  const [proxyHttpsRevealed, setProxyHttpsRevealed] = useState(false);
  const [proxyTesting, setProxyTesting] = useState(false);
  const [proxyTestSummary, setProxyTestSummary] = useState<string | null>(null);
  const [proxyTestSuccess, setProxyTestSuccess] = useState<boolean | null>(null);
  const [lastProxyTestResult, setLastProxyTestResult] = useState<ProxyTestResult | null>(null);

  const manualOpen = settings.proxy.mode === "manual";
  const environmentOpen = settings.proxy.mode === "environment";
  const proxyAuthOpen = settings.proxy.mode !== "none";
  const configuredNoProxyOpen = proxyAuthOpen && !environmentOpen;
  const proxyTestUrl = settings.proxyTestUrl.trim() || DEFAULT_PROXY_TEST_URL;

  const persist = (applyThemeLanguage = false) => {
    scheduleSave();
    if (applyThemeLanguage) applyUserSettings(settings);
    refresh();
  };

  const formatProxyTestBrief = (response: ProxyTestResult) => {
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
  };

  const runProxyTest = async () => {
    setProxyTesting(true);
    setProxyTestSummary(null);
    setProxyTestSuccess(null);
    try {
      const response = await invoke<ProxyTestResult>("test_proxy_connection", {
        payload: {
          proxy: proxyPayload(settings.proxy),
          url: settings.proxyTestUrl.trim() || null,
          timeout_secs: settings.requestTimeoutSecs
        }
      });
      setLastProxyTestResult(response);
      setProxyTestSummary(formatProxyTestBrief(response));
      setProxyTestSuccess(response.ok);
    } catch (error) {
      const response: ProxyTestResult = {
        ok: false,
        duration_ms: 0,
        error: error instanceof Error ? error.message : String(error),
        log: [error instanceof Error ? error.message : String(error)]
      };
      setLastProxyTestResult(response);
      setProxyTestSummary(formatProxyTestBrief(response));
      setProxyTestSuccess(false);
    } finally {
      setProxyTesting(false);
    }
  };

  const clearAllData = async () => {
    const answer = await messageDialog("confirmation", labels.clearDataTitle, labels.clearDataBody);
    if (answer !== "confirm") return;
    resetAppStateToDefaults(state);
    resetSettingsSessionState();
    applyUserSettings(state.settings);
    await persistConfig();
    setActiveTab("general");
    refresh();
  };

  const tabs: Array<{ id: SettingsTabId; label: string }> = [
    { id: "general", label: labels.tabGeneral },
    { id: "editor", label: labels.tabEditor },
    { id: "network", label: labels.tabNetwork },
    { id: "about", label: labels.tabAbout }
  ];

  return (
    <section className="settings-view">
      <div className="segmented settings-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            data-settings-tab={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-grid">
        {activeTab === "general" ? (
          <>
            <section className="settings-card">
              <h2>{labels.appearance}</h2>
              <label className="settings-field">
                <span>{labels.theme}</span>
                <select
                  id="setting-theme"
                  value={settings.theme}
                  onChange={(event) => {
                    settings.theme = event.target.value as UserSettings["theme"];
                    persist(true);
                  }}
                >
                  <option value="light">{labels.themeLight}</option>
                  <option value="dark">{labels.themeDark}</option>
                </select>
              </label>
            </section>

            <section className="settings-card">
              <h2>{labels.windowSection}</h2>
              <label className="settings-field settings-toggle">
                <span>{labels.maximizeOnStartup}</span>
                <input
                  id="setting-maximize-on-startup"
                  type="checkbox"
                  checked={settings.maximizeOnStartup}
                  onChange={(event) => {
                    settings.maximizeOnStartup = event.target.checked;
                    persist();
                  }}
                />
              </label>
            </section>

            <section className="settings-card">
              <h2>{labels.languageSection}</h2>
              <label className="settings-field">
                <span>{labels.language}</span>
                <select
                  id="setting-language"
                  value={settings.language}
                  onChange={(event) => {
                    settings.language = event.target.value as UserSettings["language"];
                    persist(true);
                  }}
                >
                  <option value="en">{labels.languageEn}</option>
                  <option value="es">{labels.languageEs}</option>
                </select>
              </label>
            </section>
          </>
        ) : null}

        {activeTab === "editor" ? (
          <>
            <section className="settings-card settings-collections-card">
              <h2>{labels.collectionsSection}</h2>
              <fieldset className="settings-duplicate-naming">
                <legend className="settings-option-label">{labels.duplicateNamingSection}</legend>
                <label className="settings-radio-row">
                  <input
                    type="radio"
                    name="duplicate-naming"
                    value="copyOf"
                    checked={settings.duplicateNaming === "copyOf"}
                    onChange={() => {
                      settings.duplicateNaming = "copyOf";
                      persist();
                    }}
                  />
                  <span>{labels.duplicateNamingCopyOf}</span>
                </label>
                <label className="settings-radio-row">
                  <input
                    type="radio"
                    name="duplicate-naming"
                    value="numbered"
                    checked={settings.duplicateNaming === "numbered"}
                    onChange={() => {
                      settings.duplicateNaming = "numbered";
                      persist();
                    }}
                  />
                  <span>{labels.duplicateNamingNumbered}</span>
                </label>
              </fieldset>
            </section>

            <section className="settings-card settings-editing-card">
              <h2>{labels.editingSection}</h2>
              <div className="settings-options">
                <div className="settings-option">
                  <label className="settings-field">
                    <span className="settings-option-label">{labels.tabSize}</span>
                    <input
                      id="setting-tab-size"
                      type="number"
                      min={1}
                      max={8}
                      step={1}
                      value={settings.tabSize}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        settings.tabSize = Number.isFinite(parsed)
                          ? Math.max(1, Math.min(8, Math.round(parsed)))
                          : 2;
                        persist();
                      }}
                    />
                  </label>
                  <p className="settings-option-hint">{labels.tabSizeHint}</p>
                </div>
                <div className="settings-option">
                  <label className="settings-toggle-row" htmlFor="setting-auto-prettify-json">
                    <span className="settings-option-label">{labels.autoPrettifyJson}</span>
                    <input
                      id="setting-auto-prettify-json"
                      type="checkbox"
                      checked={settings.autoPrettifyJson}
                      onChange={(event) => {
                        settings.autoPrettifyJson = event.target.checked;
                        persist();
                      }}
                    />
                  </label>
                  <p className="settings-option-hint">{labels.autoPrettifyJsonHint}</p>
                </div>
                <div className="settings-option">
                  <label className="settings-toggle-row" htmlFor="setting-click-to-select">
                    <span className="settings-option-label">{labels.clickToSelect}</span>
                    <input
                      id="setting-click-to-select"
                      type="checkbox"
                      checked={settings.clickToSelect}
                      onChange={(event) => {
                        settings.clickToSelect = event.target.checked;
                        persist();
                      }}
                    />
                  </label>
                  <p className="settings-option-hint">{labels.clickToSelectHint}</p>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "network" ? (
          <section className="settings-card settings-card-wide settings-network-card">
            <h2>{labels.network}</h2>
            <div className="settings-network-general">
              <label className="settings-field settings-field-compact">
                <span>{labels.requestTimeout}</span>
                <input
                  id="setting-request-timeout"
                  type="number"
                  min={5}
                  max={300}
                  step={1}
                  value={settings.requestTimeoutSecs}
                  title={labels.requestTimeoutHint}
                  onChange={(event) => {
                    settings.requestTimeoutSecs = clampRequestTimeoutSecs(event.target.value);
                    persist();
                  }}
                />
              </label>
              <label className="settings-toggle-row settings-network-toggle" htmlFor="setting-follow-redirects">
                <span>{labels.followRedirects}</span>
                <input
                  id="setting-follow-redirects"
                  type="checkbox"
                  checked={settings.followRedirects}
                  title={labels.followRedirectsHint}
                  onChange={(event) => {
                    settings.followRedirects = event.target.checked;
                    persist();
                  }}
                />
              </label>
            </div>

            <div className="settings-network-proxy">
              <div className="settings-proxy-head">
                <label className="settings-field">
                  <span>{labels.proxy}</span>
                  <select
                    id="setting-proxy-mode"
                    value={settings.proxy.mode}
                    onChange={(event) => {
                      const mode = event.target.value as UserSettings["proxy"]["mode"];
                      settings.proxy.authMode = proxyAuthModeForModeChange(mode, settings.proxy.authMode);
                      settings.proxy.mode = mode;
                      persist();
                    }}
                  >
                    <option value="none">{labels.proxyNone}</option>
                    <option value="system">{labels.proxySystem}</option>
                    <option value="environment">{labels.proxyEnvironment}</option>
                    <option value="manual">{labels.proxyManual}</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>{labels.proxyAuth}</span>
                  <select
                    id="setting-proxy-auth"
                    value={settings.proxy.authMode}
                    disabled={!proxyAuthOpen}
                    onChange={(event) => {
                      settings.proxy.authMode = event.target.value as UserSettings["proxy"]["authMode"];
                      persist();
                    }}
                  >
                    <option value="auto">{labels.proxyAuthAuto}</option>
                    <option value="basic">{labels.proxyAuthBasic}</option>
                    <option value="ntlm">{labels.proxyAuthNtlm}</option>
                    <option value="negotiate">{labels.proxyAuthNegotiate}</option>
                  </select>
                </label>
              </div>

              <div className={`settings-proxy-environment${environmentOpen ? " open" : ""}`} id="proxy-environment-fields">
                <label className="settings-toggle-row" htmlFor="setting-proxy-env-http">
                  <span>HTTP_PROXY</span>
                  <input
                    id="setting-proxy-env-http"
                    type="checkbox"
                    checked={settings.proxy.useHttpProxyEnv}
                    disabled={!environmentOpen}
                    onChange={(event) => {
                      settings.proxy.useHttpProxyEnv = event.target.checked;
                      persist();
                    }}
                  />
                </label>
                <label className="settings-toggle-row" htmlFor="setting-proxy-env-https">
                  <span>HTTPS_PROXY</span>
                  <input
                    id="setting-proxy-env-https"
                    type="checkbox"
                    checked={settings.proxy.useHttpsProxyEnv}
                    disabled={!environmentOpen}
                    onChange={(event) => {
                      settings.proxy.useHttpsProxyEnv = event.target.checked;
                      persist();
                    }}
                  />
                </label>
                <label className="settings-toggle-row" htmlFor="setting-proxy-env-no-proxy">
                  <span>NO_PROXY</span>
                  <input
                    id="setting-proxy-env-no-proxy"
                    type="checkbox"
                    checked={settings.proxy.useNoProxyEnv}
                    disabled={!environmentOpen}
                    onChange={(event) => {
                      settings.proxy.useNoProxyEnv = event.target.checked;
                      persist();
                    }}
                  />
                </label>
              </div>

              <div className={`settings-proxy-urls${manualOpen ? " open" : ""}`} id="proxy-url-fields">
                <label className="settings-field">
                  <span>{labels.proxyHttp}</span>
                  <ProxyUrlField
                    inputId="setting-proxy-http"
                    value={settings.proxy.httpProxy}
                    placeholder={labels.proxyUrlPlaceholder}
                    revealed={proxyHttpRevealed}
                    disabled={!manualOpen}
                    onChange={(value) => {
                      settings.proxy.httpProxy = value;
                      persist();
                    }}
                    onToggleReveal={() => setProxyHttpRevealed((value) => !value)}
                    onClear={() => {
                      settings.proxy.httpProxy = "";
                      persist();
                    }}
                  />
                </label>
                <label className="settings-field">
                  <span>{labels.proxyHttps}</span>
                  <ProxyUrlField
                    inputId="setting-proxy-https"
                    value={settings.proxy.httpsProxy}
                    placeholder={labels.proxyUrlPlaceholder}
                    revealed={proxyHttpsRevealed}
                    disabled={!manualOpen}
                    onChange={(value) => {
                      settings.proxy.httpsProxy = value;
                      persist();
                    }}
                    onToggleReveal={() => setProxyHttpsRevealed((value) => !value)}
                    onClear={() => {
                      settings.proxy.httpsProxy = "";
                      persist();
                    }}
                  />
                </label>
              </div>

              <div className={`settings-proxy-bypass${configuredNoProxyOpen ? " open" : ""}`} id="proxy-bypass-field">
                <label className="settings-field">
                  <span>{labels.proxyBypass}</span>
                  <div className="settings-input-shell">
                    <input
                      id="setting-proxy-no-proxy"
                      type="text"
                      value={settings.proxy.noProxy}
                      placeholder={labels.proxyBypassPlaceholder}
                      spellCheck={false}
                      autoComplete="off"
                      disabled={!configuredNoProxyOpen}
                      onChange={(event) => {
                        settings.proxy.noProxy = event.target.value;
                        persist();
                      }}
                    />
                    <div className="settings-input-trailing">
                      <button
                        className="mini-btn field-remove-btn settings-input-clear"
                        id="clear-proxy-no-proxy"
                        type="button"
                        title={clearFieldLabel}
                        aria-label={clearFieldLabel}
                        disabled={!configuredNoProxyOpen}
                        onClick={() => {
                          settings.proxy.noProxy = "";
                          persist();
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </label>
              </div>

              <label className="settings-field settings-proxy-test">
                <span>{labels.proxyTestUrl}</span>
                <div className="settings-proxy-test-row">
                  <input
                    id="setting-proxy-test-url"
                    type="url"
                    value={proxyTestUrl}
                    placeholder={labels.proxyTestUrlPlaceholder}
                    spellCheck={false}
                    onChange={(event) => {
                      settings.proxyTestUrl = event.target.value;
                      persist();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void runProxyTest();
                      }
                    }}
                  />
                  <button
                    className="settings-proxy-test-btn"
                    id="proxy-test-btn"
                    type="button"
                    disabled={proxyTesting}
                    onClick={() => void runProxyTest()}
                  >
                    {proxyTesting ? labels.proxyTesting : labels.proxyTest}
                  </button>
                </div>
                {proxyTestSummary ? (
                  <div className="settings-proxy-test-outcome" id="proxy-test-outcome">
                    <span
                      className={`settings-proxy-test-summary${proxyTestSuccess ? " is-success" : " is-error"}`}
                      id="proxy-test-summary"
                    >
                      {proxyTestSummary}
                    </span>
                    {lastProxyTestResult?.log?.length ? (
                      <button
                        type="button"
                        id="proxy-test-details-btn"
                        className="settings-proxy-test-details-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          void applicationDialog({
                            title: labels.proxyTestLogTitle,
                            body: "",
                            mode: "proxy-test-log",
                            previewHtml: `<pre class="proxy-test-log">${(lastProxyTestResult.log ?? [])
                              .map((line) =>
                                line
                                  .replace(/&/g, "&amp;")
                                  .replace(/</g, "&lt;")
                                  .replace(/>/g, "&gt;")
                              )
                              .join("\n")}</pre>`,
                            resizable: true,
                            width: 560,
                            height: 420,
                            actions: [{ id: "close", label: t().dialog.close, role: "primary" }]
                          });
                        }}
                      >
                        {labels.proxyTestDetails}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </label>
            </div>
          </section>
        ) : null}

        {activeTab === "about" ? (
          <>
            <section className="settings-card settings-card-wide about-card">
              <h2>{labels.about}</h2>
              <dl className="about-list">
                <div>
                  <dt>{labels.aboutAuthor}</dt>
                  <dd>Pablo Medina</dd>
                </div>
                <div>
                  <dt>{labels.aboutDescription}</dt>
                  <dd>{labels.aboutText}</dd>
                </div>
                <div>
                  <dt>{labels.aboutLicense}</dt>
                  <dd>{labels.licenseMit}</dd>
                </div>
              </dl>
            </section>

            <section className="settings-card settings-card-wide settings-danger-card">
              <h2>{labels.data}</h2>
              <p className="settings-danger-copy">{labels.clearDataBody}</p>
              <button className="danger-button settings-clear-btn" id="clear-all-data" type="button" onClick={() => void clearAllData()}>
                {labels.clearData}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}

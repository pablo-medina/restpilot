import { useCallback, type ReactNode } from "react";
import { scheduleSave } from "../../app/persistence";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { VariableInput } from "./VariableInput";
import { SecretInput } from "./SecretInput";
import { normalizeRequestAuth, resolvedBasicCredentials } from "../../app/request-auth";
import { getEffectiveVariables } from "../../app/environments";
import { compactBase64, decodeBasicCredentials } from "../../lib/basic-auth";
import { getActiveRequest, id, state } from "../../app/state";
import { ingestUrlIntoRequest } from "../../lib/url-params";
import { applyVariables, displayRequestUrl } from "../../lib/variables";
import { HTTP_METHODS, isHttpMethod } from "../../lib/http-methods";
import { t } from "../../i18n";
import type { BodyMode, FormPartType, Pair, RawType, RequestAuth, RequestTab } from "../../types";
import { handleRequestCurlPaste } from "../../app/request-curl-paste";
import { ensureTab } from "../lib/ensure-tab";
import { cancelActiveRequest, trySendRequest } from "../lib/request-send";
import { PairRow } from "./PairRow";

type Props = {
  refresh: () => void;
  responsePanel?: ReactNode;
};

function ensureFormRow(request: NonNullable<ReturnType<typeof getActiveRequest>>) {
  if (request.bodyMode === "form" && request.form.length === 0) {
    request.form.push({ id: id(), key: "", value: "", enabled: true, partType: "text" });
  }
}

const VARIABLE_TEMPLATE = /\$\{[^}]+\}/;

/**
 * Shows what actually goes on the wire: the encoded value in credential mode, and what a
 * pasted token decodes to in token mode (username only — the password stays hidden).
 */
function BasicAuthPreview({ auth }: { auth: RequestAuth }) {
  const labels = t().request.auth;
  const variables = getEffectiveVariables();

  if (auth.basicMode === "token") {
    const resolved = compactBase64(applyVariables(auth.basicToken ?? "", variables));
    if (!resolved) return null;
    const decoded = decodeBasicCredentials(resolved);
    if (decoded) {
      return <p className="auth-hint auth-basic-preview">{labels.basicTokenDecoded.replace("{username}", decoded.username)}</p>;
    }
    if (VARIABLE_TEMPLATE.test(resolved)) {
      return <p className="auth-hint auth-basic-preview">{labels.basicTokenVariable}</p>;
    }
    return <p className="auth-hint auth-basic-preview is-warning">{labels.basicTokenInvalid}</p>;
  }

  const encoded = resolvedBasicCredentials(auth, variables);
  if (!encoded) return null;
  return (
    <p className="auth-hint auth-basic-preview">
      <span className="auth-basic-preview-text">{labels.basicEncodedPreview.replace("{token}", encoded)}</span>
      <button
        type="button"
        className="mini-btn"
        title={labels.copyEncoded}
        aria-label={labels.copyEncoded}
        onClick={() => void navigator.clipboard.writeText(encoded)}
      >
        {labels.copyEncodedShort}
      </button>
    </p>
  );
}

function AuthPanel({
  request,
  onAuthChange
}: {
  request: NonNullable<ReturnType<typeof getActiveRequest>>;
  onAuthChange: () => void;
}) {
  const labels = t().request.auth;
  const auth = normalizeRequestAuth(request.auth);

  const persistAuth = (next: RequestAuth) => {
    request.auth = normalizeRequestAuth(next);
    onAuthChange();
  };

  return (
    <div className="request-tab-panel request-auth-panel">
      <label className="auth-field">
        <span className="auth-field-label">{labels.type}</span>
        <select
          id="auth-type"
          value={auth.type}
          onChange={(event) => {
            const type = event.target.value as RequestAuth["type"];
            if (type === "none") persistAuth({ type: "none" });
            else if (type === "bearer") persistAuth({ type, bearerToken: auth.bearerToken ?? "" });
            else if (type === "basic") {
              persistAuth({
                type,
                basicUsername: auth.basicUsername ?? "",
                basicPassword: auth.basicPassword ?? ""
              });
            } else {
              persistAuth({
                type: "apikey",
                apiKeyName: auth.apiKeyName ?? "",
                apiKeyValue: auth.apiKeyValue ?? "",
                apiKeyIn: auth.apiKeyIn === "query" ? "query" : "header"
              });
            }
          }}
        >
          <option value="none">{labels.typeNone}</option>
          <option value="bearer">{labels.typeBearer}</option>
          <option value="basic">{labels.typeBasic}</option>
          <option value="apikey">{labels.typeApiKey}</option>
        </select>
      </label>

      <div className={`auth-fields${auth.type !== "bearer" ? " is-hidden" : ""}`} data-auth-panel="bearer">
        <label className="auth-field">
          <span className="auth-field-label">{labels.bearerToken}</span>
          <SecretInput
            id="auth-bearer-token"
            value={auth.bearerToken ?? ""}
            placeholder={labels.bearerPlaceholder}
            onChange={(value) => persistAuth({ type: "bearer", bearerToken: value })}
            useVariableInput
          />
        </label>
      </div>

      <div className={`auth-fields${auth.type !== "basic" ? " is-hidden" : ""}`} data-auth-panel="basic">
        <div className="auth-field">
          <span className="auth-field-label">{labels.basicMode}</span>
          <div className="segmented auth-basic-mode">
            <button
              type="button"
              className={auth.basicMode !== "token" ? "active" : ""}
              onClick={() => persistAuth({ ...auth, type: "basic", basicMode: "credentials" })}
            >
              {labels.basicModeFields}
            </button>
            <button
              type="button"
              className={auth.basicMode === "token" ? "active" : ""}
              onClick={() =>
                persistAuth({
                  ...auth,
                  type: "basic",
                  basicMode: "token",
                  // Carry the fields over so switching modes is not destructive.
                  basicToken: auth.basicToken || resolvedBasicCredentials({ ...auth, basicMode: "credentials" }, [])
                })
              }
            >
              {labels.basicModeToken}
            </button>
          </div>
        </div>

        <div className={`auth-fields${auth.basicMode === "token" ? " is-hidden" : ""}`}>
          <label className="auth-field">
            <span className="auth-field-label">{labels.basicUsername}</span>
            <VariableInput
              id="auth-basic-username"
              value={auth.basicUsername ?? ""}
              placeholder={labels.basicUsernamePlaceholder}
              spellCheck={false}
              autoComplete="username"
              onValueChange={(value) =>
                persistAuth({
                  ...auth,
                  type: "basic",
                  basicMode: "credentials",
                  basicUsername: value
                })
              }
            />
          </label>
          <label className="auth-field">
            <span className="auth-field-label">{labels.basicPassword}</span>
            <SecretInput
              id="auth-basic-password"
              value={auth.basicPassword ?? ""}
              placeholder={labels.basicPasswordPlaceholder}
              autoComplete="current-password"
              onChange={(value) =>
                persistAuth({
                  ...auth,
                  type: "basic",
                  basicMode: "credentials",
                  basicPassword: value
                })
              }
              useVariableInput
            />
          </label>
        </div>

        <div className={`auth-fields${auth.basicMode === "token" ? "" : " is-hidden"}`}>
          <label className="auth-field">
            <span className="auth-field-label">{labels.basicToken}</span>
            <SecretInput
              id="auth-basic-token"
              value={auth.basicToken ?? ""}
              placeholder={labels.basicTokenPlaceholder}
              autoComplete="off"
              onChange={(value) =>
                persistAuth({ ...auth, type: "basic", basicMode: "token", basicToken: value })
              }
              useVariableInput
            />
          </label>
        </div>

        <BasicAuthPreview auth={auth} />
      </div>

      <div className={`auth-fields${auth.type !== "apikey" ? " is-hidden" : ""}`} data-auth-panel="apikey">
        <label className="auth-field">
          <span className="auth-field-label">{labels.apiKeyName}</span>
          <VariableInput
            id="auth-api-key-name"
            value={auth.apiKeyName ?? ""}
            placeholder={labels.apiKeyNamePlaceholder}
            spellCheck={false}
            autoComplete="off"
            onValueChange={(value) =>
              persistAuth({
                type: "apikey",
                apiKeyName: value,
                apiKeyValue: auth.apiKeyValue ?? "",
                apiKeyIn: auth.apiKeyIn === "query" ? "query" : "header"
              })
            }
          />
        </label>
        <label className="auth-field">
          <span className="auth-field-label">{labels.apiKeyValue}</span>
          <SecretInput
            id="auth-api-key-value"
            value={auth.apiKeyValue ?? ""}
            placeholder={labels.apiKeyValuePlaceholder}
            onChange={(value) =>
              persistAuth({
                type: "apikey",
                apiKeyName: auth.apiKeyName ?? "",
                apiKeyValue: value,
                apiKeyIn: auth.apiKeyIn === "query" ? "query" : "header"
              })
            }
            useVariableInput
          />
        </label>
        <div className="auth-field">
          <span className="auth-field-label">{labels.apiKeyIn}</span>
          <div className="segmented auth-key-location">
            <button
              type="button"
              className={auth.apiKeyIn !== "query" ? "active" : ""}
              onClick={() =>
                persistAuth({
                  type: "apikey",
                  apiKeyName: auth.apiKeyName ?? "",
                  apiKeyValue: auth.apiKeyValue ?? "",
                  apiKeyIn: "header"
                })
              }
            >
              {labels.apiKeyHeader}
            </button>
            <button
              type="button"
              className={auth.apiKeyIn === "query" ? "active" : ""}
              onClick={() =>
                persistAuth({
                  type: "apikey",
                  apiKeyName: auth.apiKeyName ?? "",
                  apiKeyValue: auth.apiKeyValue ?? "",
                  apiKeyIn: "query"
                })
              }
            >
              {labels.apiKeyQuery}
            </button>
          </div>
        </div>
      </div>

      <p className="auth-hint">{labels.hint}</p>
    </div>
  );
}

function MultipartRow({
  pair,
  onChange,
  onRemove
}: {
  pair: Pair;
  onChange: () => void;
  onRemove: () => void;
}) {
  const labels = t().request;
  const pairLabels = t().pairs;
  const partType: FormPartType = pair.partType === "file" ? "file" : "text";

  return (
    <div className="pair-row multipart-row" data-form-id={pair.id}>
      <input
        className="form-enabled"
        type="checkbox"
        checked={pair.enabled}
        onChange={(event) => {
          pair.enabled = event.target.checked;
          onChange();
        }}
      />
      <input
        className="form-key"
        value={pair.key}
        placeholder="Name"
        spellCheck={false}
        onChange={(event) => {
          pair.key = event.target.value;
          onChange();
        }}
      />
      <select
        className="form-part-type"
        data-form-id={pair.id}
        value={partType}
        onChange={(event) => {
          pair.partType = event.target.value === "file" ? "file" : "text";
          if (pair.partType === "text") {
            pair.fileName = undefined;
            pair.value = "";
          }
          onChange();
        }}
      >
        <option value="text">{labels.partText}</option>
        <option value="file">{labels.partFile}</option>
      </select>
      {partType === "file" ? (
        <label className="multipart-file-picker">
          <input
            className="form-file"
            data-form-id={pair.id}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = String(reader.result ?? "");
                pair.value = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : dataUrl;
                pair.fileName = file.name;
                pair.partType = "file";
                onChange();
              };
              reader.readAsDataURL(file);
            }}
          />
          <span className="multipart-file-name">{pair.fileName || labels.chooseFile}</span>
        </label>
      ) : (
        <input
          className="form-value"
          value={pair.value}
          placeholder={pairLabels.value}
          spellCheck={false}
          onChange={(event) => {
            pair.value = event.target.value;
            onChange();
          }}
        />
      )}
      <button className="mini-btn field-remove-btn remove-form" type="button" aria-label={t().tree.delete} onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

export function RequestEditor({ refresh, responsePanel }: Props) {
  const request = getActiveRequest();
  const tab = request ? ensureTab(request.id) : null;

  // Stable identity: CodeMirrorEditor remounts its editor instance whenever `onSend`
  // changes, so a fresh arrow function here on every render would flicker the body editor.
  const sendActiveRequest = useCallback(() => {
    void trySendRequest(refresh);
  }, [refresh]);

  const persist = () => {
    scheduleSave();
    refresh();
  };

  const syncUrl = () => {
    if (!request) return;
    persist();
  };


  if (!request || !tab) return null;

  const labels = t().request;
  const displayUrl = displayRequestUrl(request);

  const setRequestTab = (next: RequestTab) => {
    tab.selectedRequestTab = next;
    refresh();
  };

  const removePair = (list: Pair[], pairId: string, resyncUrl = false) => {
    const index = list.findIndex((item) => item.id === pairId);
    if (index >= 0) list.splice(index, 1);
    if (resyncUrl) syncUrl();
    else persist();
  };

  const renderBodyPanel = () => {
    if (request.bodyMode === "raw") {
      const modeClass =
        request.rawType === "json" ? "json-mode" : request.rawType === "xml" ? "xml-mode" : "text-mode";
      return (
        <CodeMirrorEditor
          key={`body-${request.id}-${request.rawType}`}
          value={request.body}
          language={request.rawType}
          tabSize={state.settings.tabSize}
          autoPrettifyJson={state.settings.autoPrettifyJson}
          onChange={(value) => { request.body = value; scheduleSave(); }}
          onSend={sendActiveRequest}
          onPaste={(event) => void handleRequestCurlPaste(event.nativeEvent, refresh)}
          className={`code-editor ${modeClass}`}
        />
      );
    }
    if (request.bodyMode === "binary") {
      const hasFile = !!request.binaryFilePath;
      const fileName = request.binaryFilePath
        ? (request.binaryFilePath.split(/[\\/]/).pop() ?? "")
        : "";
      return (
        <div className="binary-body-panel" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
          <div
            style={{
              border: "1px dashed var(--rp-border)",
              borderRadius: "var(--rp-radius)",
              padding: 24,
              textAlign: "center",
              background: "var(--rp-surface-alt, transparent)"
            }}
          >
            {hasFile ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{fileName}</span>
                </div>
                <button
                  className="quiet-button"
                  id="binary-file-picker"
                  type="button"
                  onClick={async () => {
                    const { open } = await import("@tauri-apps/plugin-dialog");
                    const selected = await open({ multiple: false, title: labels.selectBinaryFile });
                    if (selected) {
                      request.binaryFilePath = selected;
                      persist();
                    }
                  }}
                >
                  {labels.changeBinaryFile}
                </button>
              </>
            ) : (
              <button
                className="quiet-button"
                id="binary-file-picker"
                type="button"
                onClick={async () => {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const selected = await open({ multiple: false, title: labels.selectBinaryFile });
                  if (selected) {
                    request.binaryFilePath = selected;
                    persist();
                  }
                }}
              >
                {labels.selectBinaryFile}
              </button>
            )}
          </div>
          <p className="hint">{labels.binaryFileHint}</p>
        </div>
      );
    }
    if (request.bodyMode === "graphql") {
      return (
        <div className="graphql-body-panel" style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--rp-text-secondary)" }}>{labels.gqlQuery}</label>
            <CodeMirrorEditor
              key={`gql-query-${request.id}`}
              value={request.body}
              language="text"
              tabSize={state.settings.tabSize}
              onChange={(value) => { request.body = value; scheduleSave(); }}
              onSend={sendActiveRequest}
              className="code-editor text-mode"
              style={{
                flex: 1,
                minHeight: 100,
                border: "1px solid var(--rp-border)",
                borderRadius: "var(--rp-radius)",
                overflow: "hidden"
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto", minHeight: 80, gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--rp-text-secondary)" }}>{labels.gqlVariables}</label>
            <CodeMirrorEditor
              key={`gql-vars-${request.id}`}
              value={request.graphqlVariables ?? ""}
              language="json"
              tabSize={state.settings.tabSize}
              onChange={(value) => { request.graphqlVariables = value; scheduleSave(); }}
              onSend={sendActiveRequest}
              className="code-editor json-mode"
              style={{
                flex: 1,
                minHeight: 80,
                border: "1px solid var(--rp-border)",
                borderRadius: "var(--rp-radius)",
                overflow: "hidden"
              }}
            />
            <p className="hint">{labels.gqlVariablesHint}</p>
          </div>
        </div>
      );
    }
    if (request.bodyMode === "none") return null;

    const isMultipart = request.bodyMode === "multipart";
    return (
      <>
        {isMultipart ? <p className="hint multipart-hint">{labels.multipartFilesHint}</p> : null}
        <div className={`headers-list${isMultipart ? " form-list" : ""}`}>
          {request.form.map((pair) =>
            isMultipart ? (
              <MultipartRow
                key={pair.id}
                pair={pair}
                onChange={persist}
                onRemove={() => removePair(request.form, pair.id)}
              />
            ) : (
              <PairRow
                key={pair.id}
                pair={pair}
                scope="form"
                onChange={persist}
                onRemove={() => removePair(request.form, pair.id)}
              />
            )
          )}
        </div>
        {isMultipart ? (
          <div className="form-actions">
            <button
              className="quiet-button add-form"
              type="button"
              onClick={() => {
                request.form.push({ id: id(), key: "", value: "", enabled: true, partType: "text" });
                persist();
              }}
            >
              {labels.addField}
            </button>
            <button
              className="quiet-button add-form"
              type="button"
              onClick={() => {
                request.form.push({ id: id(), key: "", value: "", enabled: true, partType: "file", fileName: "" });
                persist();
              }}
            >
              {labels.addFile}
            </button>
          </div>
        ) : (
          <button
            className="quiet-button add-form"
            type="button"
            onClick={() => {
              request.form.push({ id: id(), key: "", value: "", enabled: true, partType: "text" });
              persist();
            }}
          >
            {labels.addField}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="request-editor">
      <section className="request-line">
        <select
          id="method"
          className="method-select"
          value={request.method}
          {...(isHttpMethod(request.method) ? { "data-method": request.method } : {})}
          onChange={(event) => {
            request.method = event.target.value;
            const select = event.target as HTMLSelectElement;
            if (select.value) select.dataset.method = select.value;
            persist();
          }}
        >
          {HTTP_METHODS.map((method) => (
            <option key={method} value={method} {...(isHttpMethod(method) ? { "data-method": method } : {})}>
              {method}
            </option>
          ))}
        </select>
        <div className="url-send-field">
          <VariableInput
            id="url"
            className="url-send-input"
            value={displayUrl}
            spellCheck={false}
            aria-label={labels.resolvedUrl}
            onValueChange={(value) => {
              ingestUrlIntoRequest(request, value, id);
              persist();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void trySendRequest(refresh);
              }
            }}
            onPaste={(event) => {
              void handleRequestCurlPaste(event.nativeEvent, refresh);
            }}
          />
          {tab.loading ? (
            <button
              id="cancel"
              className="url-send-btn url-send-btn--cancel danger-button"
              type="button"
              onClick={() => void cancelActiveRequest()}
            >
              <span className="pulse" />
              {labels.cancel}
            </button>
          ) : (
            <button id="send" className="url-send-btn" type="button" onClick={() => void trySendRequest(refresh)}>
              {labels.send}
            </button>
          )}
        </div>
      </section>
      <section className="editor-grid">
        <article className="request-card">
          <div className="tabs">
            {(["params", "auth", "headers", "body"] as const).map((panel) => (
              <button
                key={panel}
                className={tab.selectedRequestTab === panel ? "active" : ""}
                data-request-tab={panel}
                type="button"
                onClick={() => setRequestTab(panel)}
              >
                {panel === "auth" ? labels.authTab : labels[panel]}
              </button>
            ))}
          </div>

          {tab.selectedRequestTab === "auth" ? (
            <AuthPanel request={request} onAuthChange={persist} />
          ) : null}

          {tab.selectedRequestTab === "params" ? (
            <div className="request-tab-panel">
              <div className="request-tab-toolbar">
                <button
                  className="mini-btn"
                  type="button"
                  aria-label={labels.addField}
                  onClick={() => {
                    request.queryParams.push({ id: id(), key: "", value: "", enabled: true });
                    syncUrl();
                  }}
                >
                  +
                </button>
              </div>
              <div className="headers-list request-pairs-list">
                {request.queryParams.map((pair) => (
                  <PairRow
                    key={pair.id}
                    pair={pair}
                    scope="query"
                    onChange={syncUrl}
                    onRemove={() => removePair(request.queryParams, pair.id, true)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {tab.selectedRequestTab === "headers" ? (
            <div className="request-tab-panel">
              <div className="request-tab-toolbar">
                <button
                  className="mini-btn"
                  type="button"
                  aria-label={labels.addField}
                  onClick={() => {
                    request.headers.push({ id: id(), key: "", value: "", enabled: true });
                    persist();
                  }}
                >
                  +
                </button>
              </div>
              <div className="headers-list request-pairs-list">
                {request.headers.map((pair) => (
                  <PairRow
                    key={pair.id}
                    pair={pair}
                    scope="header"
                    onChange={persist}
                    onRemove={() => removePair(request.headers, pair.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {tab.selectedRequestTab === "body" ? (
            <div className="request-tab-panel">
              <div className="body-toolbar">
                <div className="segmented body-mode-switch">
                  {(
                    [
                      ["raw", labels.raw],
                      ["form", labels.form],
                      ["multipart", labels.multipart],
                      ["binary", labels.binary],
                      ["graphql", labels.graphql],
                      ["none", labels.none]
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      className={request.bodyMode === mode ? "active" : ""}
                      data-body-mode={mode}
                      type="button"
                      onClick={() => {
                        request.bodyMode = mode as BodyMode;
                        ensureFormRow(request);
                        persist();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {request.bodyMode === "raw" ? (
                  <label className="raw-type-select-wrap body-toolbar-trailing">
                    <span className="raw-type-select-label">{labels.rawFormat}</span>
                    <select
                      id="raw-type"
                      className="raw-type-select"
                      aria-label={labels.rawFormat}
                      value={request.rawType}
                      onChange={(event) => {
                        request.rawType = event.target.value as RawType;
                        persist();
                      }}
                    >
                      <option value="text">{labels.rawText}</option>
                      <option value="json">{labels.rawJson}</option>
                      <option value="xml">{labels.rawXml}</option>
                    </select>
                  </label>
                ) : null}
              </div>
              {renderBodyPanel()}
            </div>
          ) : null}
        </article>
        {responsePanel}
      </section>
    </div>
  );
}

import { scheduleSave } from "../../../app/persistence";
import { normalizeRequestAuth } from "../../../app/request-auth";
import { t } from "../../../i18n";
import type { AppFunction, RequestAuth } from "../../../types";
import { SecretInput } from "../SecretInput";

type Props = {
  func: AppFunction;
  onChange: () => void;
};

export function FunctionAuthFields({ func, onChange }: Props) {
  const labels = t().request.auth;
  const auth = normalizeRequestAuth(func.auth);

  const persistAuth = (next: RequestAuth) => {
    func.auth = normalizeRequestAuth(next);
    scheduleSave();
    onChange();
  };

  return (
    <div
      className="request-tab-panel request-auth-panel flex flex-col flex-1"
      style={{ padding: 0, alignContent: "start", alignItems: "start", display: "grid", gap: 12 }}
    >
      <label className="auth-field" style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
        <span className="auth-field-label" style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>
          {labels.type}
        </span>
        <select
          value={auth.type}
          style={{
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid var(--rp-border)",
            background: "var(--rp-surface)",
            fontWeight: 500
          }}
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

      {auth.type === "bearer" ? (
        <label className="auth-field" style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
          <span className="auth-field-label" style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>
            {labels.bearerToken}
          </span>
          <SecretInput
            value={auth.bearerToken ?? ""}
            placeholder={labels.bearerPlaceholder}
            onChange={(value) => persistAuth({ type: "bearer", bearerToken: value })}
          />
        </label>
      ) : null}

      {auth.type === "basic" ? (
        <>
          <label className="auth-field" style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            <span className="auth-field-label" style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>
              {labels.basicUsername}
            </span>
            <input
              value={auth.basicUsername ?? ""}
              placeholder={labels.basicUsernamePlaceholder}
              spellCheck={false}
              autoComplete="username"
              className="url-send-input"
              style={{ padding: "6px 12px" }}
              onChange={(event) =>
                persistAuth({
                  type: "basic",
                  basicUsername: event.target.value,
                  basicPassword: auth.basicPassword ?? ""
                })
              }
            />
          </label>
          <label className="auth-field" style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            <span className="auth-field-label" style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>
              {labels.basicPassword}
            </span>
            <SecretInput
              value={auth.basicPassword ?? ""}
              placeholder={labels.basicPasswordPlaceholder}
              autoComplete="current-password"
              onChange={(value) =>
                persistAuth({
                  type: "basic",
                  basicUsername: auth.basicUsername ?? "",
                  basicPassword: value
                })
              }
            />
          </label>
        </>
      ) : null}

      {auth.type === "apikey" ? (
        <>
          <label className="auth-field" style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            <span className="auth-field-label" style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>
              {labels.apiKeyName}
            </span>
            <input
              value={auth.apiKeyName ?? ""}
              placeholder={labels.apiKeyNamePlaceholder}
              spellCheck={false}
              autoComplete="off"
              className="url-send-input"
              style={{ padding: "6px 12px" }}
              onChange={(event) =>
                persistAuth({
                  type: "apikey",
                  apiKeyName: event.target.value,
                  apiKeyValue: auth.apiKeyValue ?? "",
                  apiKeyIn: auth.apiKeyIn === "query" ? "query" : "header"
                })
              }
            />
          </label>
          <label className="auth-field" style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            <span className="auth-field-label" style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>
              {labels.apiKeyValue}
            </span>
            <SecretInput
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
            />
          </label>
          <div className="auth-field" style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            <span className="auth-field-label" style={{ fontSize: 12, fontWeight: 600, color: "var(--rp-text-muted)" }}>
              {labels.apiKeyIn}
            </span>
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
        </>
      ) : null}
    </div>
  );
}

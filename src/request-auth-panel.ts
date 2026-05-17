import { escapeAttribute } from "./content-display";
import { defaultRequestAuth, normalizeRequestAuth } from "./app/request-auth";
import { t } from "./i18n";
import type { RequestAuth, SavedRequest } from "./types";
import { hiddenClass } from "./ui/visibility";

export function renderAuthPanel(request: SavedRequest) {
  const labels = t().request.auth;
  const auth = normalizeRequestAuth(request.auth);

  return `
    <div class="request-tab-panel request-auth-panel">
      <label class="auth-field">
        <span class="auth-field-label">${labels.type}</span>
        <select id="auth-type" data-auth-field="type">
          <option value="none" ${auth.type === "none" ? "selected" : ""}>${labels.typeNone}</option>
          <option value="bearer" ${auth.type === "bearer" ? "selected" : ""}>${labels.typeBearer}</option>
          <option value="basic" ${auth.type === "basic" ? "selected" : ""}>${labels.typeBasic}</option>
          <option value="apikey" ${auth.type === "apikey" ? "selected" : ""}>${labels.typeApiKey}</option>
        </select>
      </label>
      <div class="auth-fields${hiddenClass(auth.type !== "bearer")}" data-auth-panel="bearer">
        <label class="auth-field">
          <span class="auth-field-label">${labels.bearerToken}</span>
          <input id="auth-bearer-token" type="password" value="${escapeAttribute(auth.bearerToken ?? "")}" placeholder="${labels.bearerPlaceholder}" spellcheck="false" autocomplete="off" />
        </label>
      </div>
      <div class="auth-fields${hiddenClass(auth.type !== "basic")}" data-auth-panel="basic">
        <label class="auth-field">
          <span class="auth-field-label">${labels.basicUsername}</span>
          <input id="auth-basic-username" value="${escapeAttribute(auth.basicUsername ?? "")}" placeholder="${labels.basicUsernamePlaceholder}" spellcheck="false" autocomplete="username" />
        </label>
        <label class="auth-field">
          <span class="auth-field-label">${labels.basicPassword}</span>
          <input id="auth-basic-password" type="password" value="${escapeAttribute(auth.basicPassword ?? "")}" placeholder="${labels.basicPasswordPlaceholder}" spellcheck="false" autocomplete="current-password" />
        </label>
      </div>
      <div class="auth-fields${hiddenClass(auth.type !== "apikey")}" data-auth-panel="apikey">
        <label class="auth-field">
          <span class="auth-field-label">${labels.apiKeyName}</span>
          <input id="auth-api-key-name" value="${escapeAttribute(auth.apiKeyName ?? "")}" placeholder="${labels.apiKeyNamePlaceholder}" spellcheck="false" autocomplete="off" />
        </label>
        <label class="auth-field">
          <span class="auth-field-label">${labels.apiKeyValue}</span>
          <input id="auth-api-key-value" type="password" value="${escapeAttribute(auth.apiKeyValue ?? "")}" placeholder="${labels.apiKeyValuePlaceholder}" spellcheck="false" autocomplete="off" />
        </label>
        <div class="auth-field">
          <span class="auth-field-label">${labels.apiKeyIn}</span>
          <div class="segmented auth-key-location">
            <button type="button" class="${auth.apiKeyIn !== "query" ? "active" : ""}" data-auth-key-in="header">${labels.apiKeyHeader}</button>
            <button type="button" class="${auth.apiKeyIn === "query" ? "active" : ""}" data-auth-key-in="query">${labels.apiKeyQuery}</button>
          </div>
        </div>
      </div>
      <p class="auth-hint">${labels.hint}</p>
    </div>
  `;
}

function readAuthFromForm(request: SavedRequest): RequestAuth {
  const type = (document.querySelector<HTMLSelectElement>("#auth-type")?.value ??
    "none") as RequestAuth["type"];

  if (type === "bearer") {
    return {
      type,
      bearerToken: document.querySelector<HTMLInputElement>("#auth-bearer-token")?.value ?? ""
    };
  }

  if (type === "basic") {
    return {
      type,
      basicUsername: document.querySelector<HTMLInputElement>("#auth-basic-username")?.value ?? "",
      basicPassword: document.querySelector<HTMLInputElement>("#auth-basic-password")?.value ?? ""
    };
  }

  if (type === "apikey") {
    const active = document.querySelector<HTMLButtonElement>("[data-auth-key-in].active");
    return {
      type,
      apiKeyName: document.querySelector<HTMLInputElement>("#auth-api-key-name")?.value ?? "",
      apiKeyValue: document.querySelector<HTMLInputElement>("#auth-api-key-value")?.value ?? "",
      apiKeyIn: active?.dataset.authKeyIn === "query" ? "query" : "header"
    };
  }

  return defaultRequestAuth();
}

function syncAuthPanels(type: RequestAuth["type"]) {
  document.querySelectorAll<HTMLElement>("[data-auth-panel]").forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.authPanel !== type);
  });
}

export function bindAuthPanel(request: SavedRequest, onChange: () => void) {
  request.auth = normalizeRequestAuth(request.auth);

  const persist = () => {
    request.auth = normalizeRequestAuth(readAuthFromForm(request));
    onChange();
  };

  document.querySelector<HTMLSelectElement>("#auth-type")?.addEventListener("change", (event) => {
    const type = (event.target as HTMLSelectElement).value as RequestAuth["type"];
    syncAuthPanels(type);
    persist();
  });

  document
    .querySelectorAll<HTMLInputElement>(".request-auth-panel input")
    .forEach((input) => input.addEventListener("input", persist));

  document.querySelectorAll<HTMLButtonElement>("[data-auth-key-in]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll<HTMLButtonElement>("[data-auth-key-in]").forEach((entry) => {
        entry.classList.toggle("active", entry === button);
      });
      persist();
    });
  });
}

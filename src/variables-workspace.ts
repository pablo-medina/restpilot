import { inputDialog, messageDialog } from "./components/dialogs";
import { escapeHtml } from "./content-display";
import { iconRemove } from "./icons";
import { t } from "./i18n";
import {
  bindVariableSecretToggle,
  renderVariableSecretButton,
  renderVariableValueInput,
  syncVariableRowSecretUi
} from "./variable-ui";
import { scheduleSave } from "./app/persistence";
import { escapeAttribute, id, state } from "./app/state";
import type { Environment, Variable } from "./types";

type VariableChangeHandler = () => void;

function formatVariablesStats(total: number, active: number) {
  return t().variables.stats.replace("{total}", String(total)).replace("{active}", String(active));
}

function renderVariableToken(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return `<span class="variable-token variable-token-empty">—</span>`;
  return `<code class="variable-token">${escapeHtml(`\${${trimmed}}`)}</code>`;
}

function renderGlobalVariableItem(variable: Variable) {
  const labels = t().variables;
  const disabledClass = variable.enabled ? "" : " is-disabled";
  const secretClass = variable.secret ? " is-secret" : "";
  return `
    <div class="variable-item${disabledClass}${secretClass}" data-variable-id="${variable.id}">
      <label class="variable-toggle" title="${labels.colEnabled}">
        <input class="variable-enabled" type="checkbox" ${variable.enabled ? "checked" : ""} />
        <span class="variable-toggle-ui" aria-hidden="true"></span>
      </label>
      ${renderVariableSecretButton(variable)}
      <div class="variable-field variable-field-name">
        <span class="variable-field-label">${labels.colName}</span>
        <input class="variable-name" value="${escapeAttribute(variable.name)}" placeholder="${labels.namePlaceholder}" spellcheck="false" autocomplete="off" />
      </div>
      <div class="variable-field variable-field-token">
        <span class="variable-field-label">${labels.tokenPreview}</span>
        ${renderVariableToken(variable.name)}
      </div>
      <div class="variable-field variable-field-value">
        <span class="variable-field-label">${labels.colValue}</span>
        ${renderVariableValueInput(variable, labels.valuePlaceholder)}
      </div>
      <button class="mini-btn variable-remove remove-variable" type="button" aria-label="${t().tree.delete}">${iconRemove}</button>
    </div>
  `;
}

function renderGlobalsTab() {
  const labels = t().variables;
  const variables = state.variables;
  const total = variables.length;
  const active = variables.filter((item) => item.enabled).length;

  const listMarkup = total
    ? `
      <div class="variables-table-head" aria-hidden="true">
        <span>${labels.colEnabled}</span>
        <span class="variables-col-secret" title="${labels.colSecret}">${labels.colSecret}</span>
        <span>${labels.colName}</span>
        <span>${labels.tokenPreview}</span>
        <span>${labels.colValue}</span>
        <span></span>
      </div>
      <div class="variables-list">
        ${variables.map((variable) => renderGlobalVariableItem(variable)).join("")}
      </div>
    `
    : `
      <div class="variables-empty">
        <div class="variables-empty-icon" aria-hidden="true">{ }</div>
        <h2>${labels.emptyTitle}</h2>
        <p>${labels.emptyBody}</p>
        <button class="variables-add-btn" id="add-variable-empty" type="button">${labels.addFirst}</button>
      </div>
    `;

  return `
    <div class="variables-workspace-tab-panel" data-variables-tab-panel="globals">
      <div class="variables-intro">
        <article class="variables-usage-card">
          <div class="variables-usage-badge" aria-hidden="true">{ }</div>
          <div>
            <h2>${labels.usageTitle}</h2>
            <p>${labels.usageBody}</p>
            <div class="variables-syntax-row">
              <code class="variables-syntax">${escapeHtml(labels.usageSyntax)}</code>
              <span class="variables-syntax-example">${escapeHtml(labels.usageExample)}</span>
            </div>
          </div>
        </article>
        <article class="variables-stats-card">
          <span class="variables-stats-value">${total}</span>
          <span class="variables-stats-label">${formatVariablesStats(total, active)}</span>
        </article>
      </div>
      <article class="variables-panel">
        <div class="variables-panel-head">
          <h2>${labels.title}</h2>
          ${total ? `<span class="variables-panel-meta">${formatVariablesStats(total, active)}</span>` : ""}
          ${total ? `<button class="variables-add-btn" id="add-variable" type="button"><span class="variables-add-icon" aria-hidden="true">+</span>${labels.add}</button>` : ""}
        </div>
        ${listMarkup}
      </article>
    </div>
  `;
}

function renderEnvironmentsTab() {
  const labels = t().environments;
  const selectedId = state.envManageSelectedId;
  const selected = selectedId ? state.environments.find((env) => env.id === selectedId) : null;

  return `
    <div class="variables-workspace-tab-panel" data-variables-tab-panel="environments">
      <div class="env-manage env-manage-panel" data-env-manage>
        <header class="env-manage-toolbar">
          <p class="env-manage-hint">${labels.manageHint}</p>
          <button class="variables-add-btn" type="button" data-env-add>${labels.newEnvironment}</button>
        </header>
        <div class="env-manage-split">
          <aside class="env-manage-list" role="listbox" aria-label="${labels.environmentsSection}">
            ${
              state.environments.length
                ? state.environments
                    .map(
                      (env) => `
                <button class="env-manage-item${env.id === selectedId ? " active" : ""}" type="button" data-env-select="${env.id}" role="option" aria-selected="${env.id === selectedId}">
                  <span class="env-manage-item-name">${escapeHtml(env.name)}</span>
                  <span class="env-manage-item-meta">${env.variables.filter((v) => v.enabled && v.name.trim()).length}</span>
                </button>
              `
                    )
                    .join("")
                : `<p class="env-manage-empty">${labels.emptyEnvironments}</p>`
            }
          </aside>
          <div class="env-manage-editor" data-env-editor>
            ${selected ? renderEnvironmentEditor(selected) : `<p class="env-manage-empty">${labels.selectEnvironment}</p>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderVariablesWorkspace() {
  const labels = t().environments;
  const tab = state.variablesWorkspaceTab;
  const closeLabel = t().dialog.close;

  return `
    <section class="variables-view variables-workspace">
      <div class="panel-close-sticky">
        <button class="mini-btn panel-close-btn" id="panel-back" type="button" title="${closeLabel}" aria-label="${closeLabel}">×</button>
      </div>
      <header class="variables-header">
        <div class="variables-heading">
          <h1>${labels.manageTitle}</h1>
          <p>${t().variables.description}</p>
        </div>
      </header>
      <div class="segmented variables-workspace-tabs" role="tablist">
        <button class="${tab === "globals" ? "active" : ""}" type="button" data-variables-tab="globals" role="tab" aria-selected="${tab === "globals"}">${labels.tabGlobals}</button>
        <button class="${tab === "environments" ? "active" : ""}" type="button" data-variables-tab="environments" role="tab" aria-selected="${tab === "environments"}">${labels.tabEnvironments}</button>
      </div>
      <div class="variables-workspace-body">
        ${tab === "globals" ? renderGlobalsTab() : renderEnvironmentsTab()}
      </div>
    </section>
  `;
}

export function bindVariablesWorkspace(onVariablesChanged?: VariableChangeHandler) {
  document.querySelectorAll<HTMLButtonElement>("[data-variables-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.variablesTab as "globals" | "environments";
      if (next === state.variablesWorkspaceTab) return;
      state.variablesWorkspaceTab = next;
      if (next === "environments" && !state.envManageSelectedId && state.environments.length) {
        state.envManageSelectedId = state.activeEnvironmentId ?? state.environments[0]?.id ?? null;
      }
      rerenderVariablesWorkspace(onVariablesChanged);
    });
  });

  if (state.variablesWorkspaceTab === "globals") {
    bindGlobalsTab(onVariablesChanged);
    return;
  }

  const root = document.querySelector<HTMLElement>("[data-env-manage]");
  if (root) bindEnvironmentsPanel(root, onVariablesChanged);
}

function rerenderVariablesWorkspace(onVariablesChanged?: VariableChangeHandler) {
  const host = document.querySelector<HTMLElement>(".variables-workspace");
  if (!host) return;
  host.outerHTML = renderVariablesWorkspace();
  bindVariablesWorkspace(onVariablesChanged);
}

function bindGlobalsTab(onVariablesChanged?: VariableChangeHandler) {
  const add = () => {
    state.variables.push({ id: id(), name: "", value: "", enabled: true });
    scheduleSave();
    onVariablesChanged?.();
    rerenderVariablesWorkspace(onVariablesChanged);
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLElement>(".variable-item");
      const last = rows[rows.length - 1];
      last?.querySelector<HTMLInputElement>(".variable-name")?.focus();
    });
  };

  document.querySelector("#add-variable")?.addEventListener("click", add);
  document.querySelector("#add-variable-empty")?.addEventListener("click", add);

  document.querySelectorAll<HTMLElement>(".variable-item[data-variable-id]").forEach((row) => {
    const variable = state.variables.find((item) => item.id === row.dataset.variableId);
    if (!variable) return;

    const syncToken = () => {
      const tokenHost = row.querySelector(".variable-field-token");
      if (!tokenHost) return;
      const labels = t().variables;
      const trimmed = variable.name.trim();
      const tokenMarkup = trimmed
        ? `<code class="variable-token">${escapeHtml(`\${${trimmed}}`)}</code>`
        : `<span class="variable-token variable-token-empty">—</span>`;
      tokenHost.innerHTML = `<span class="variable-field-label">${labels.tokenPreview}</span>${tokenMarkup}`;
    };

    row.querySelector<HTMLInputElement>(".variable-enabled")?.addEventListener("change", (event) => {
      variable.enabled = (event.target as HTMLInputElement).checked;
      row.classList.toggle("is-disabled", !variable.enabled);
      scheduleSave();
      onVariablesChanged?.();
    });

    row.querySelector<HTMLInputElement>(".variable-name")?.addEventListener("input", (event) => {
      variable.name = (event.target as HTMLInputElement).value;
      syncToken();
      scheduleSave();
      onVariablesChanged?.();
    });

    row.querySelector<HTMLInputElement>(".variable-value")?.addEventListener("input", (event) => {
      variable.value = (event.target as HTMLInputElement).value;
      scheduleSave();
      onVariablesChanged?.();
    });

    bindVariableSecretToggle(row, variable, () => {
      scheduleSave();
      onVariablesChanged?.();
    });
    syncVariableRowSecretUi(row, variable);

    row.querySelector(".remove-variable")?.addEventListener("click", () => {
      state.variables = state.variables.filter((item) => item.id !== variable.id);
      scheduleSave();
      onVariablesChanged?.();
      rerenderVariablesWorkspace(onVariablesChanged);
    });
  });
}

function renderEnvironmentEditor(environment: Environment): string {
  const labels = t().environments;
  return `
    <div class="env-editor" data-env-id="${environment.id}">
      <div class="env-editor-head">
        <input class="env-editor-name" value="${escapeAttribute(environment.name)}" spellcheck="false" aria-label="${labels.environmentName}" />
        <div class="env-editor-actions">
          <button class="quiet-button compact" type="button" data-env-rename>${labels.rename}</button>
          <button class="quiet-button compact danger-text" type="button" data-env-delete>${labels.deleteEnvironment}</button>
          <button class="mini-btn" type="button" data-env-var-add>${labels.addVariable}</button>
        </div>
      </div>
      ${renderManageVariableList(environment.variables)}
    </div>
  `;
}

function renderManageVariableList(variables: Variable[]): string {
  const labels = t().variables;
  if (!variables.length) {
    return `<p class="env-manage-empty">${labels.emptyTitle}</p>`;
  }
  return `
    <div class="env-manage-var-table">
      <div class="env-manage-var-head" aria-hidden="true">
        <span>${labels.colEnabled}</span>
        <span class="variables-col-secret" title="${labels.colSecret}">${labels.colSecret}</span>
        <span>${labels.colName}</span>
        <span>${labels.tokenPreview}</span>
        <span>${labels.colValue}</span>
        <span></span>
      </div>
      <div class="env-manage-var-list">
        ${variables.map((variable) => renderManageVariableRow(variable)).join("")}
      </div>
    </div>
  `;
}

function renderManageVariableRow(variable: Variable): string {
  const labels = t().variables;
  const disabledClass = variable.enabled ? "" : " is-disabled";
  const secretClass = variable.secret ? " is-secret" : "";
  const trimmed = variable.name.trim();
  const tokenMarkup = trimmed
    ? `<code class="variable-token">${escapeHtml(`\${${trimmed}}`)}</code>`
    : `<span class="variable-token variable-token-empty">—</span>`;

  return `
    <div class="variable-item env-manage-var-row${disabledClass}${secretClass}" data-variable-id="${variable.id}">
      <label class="variable-toggle" title="${labels.colEnabled}">
        <input class="variable-enabled" type="checkbox" ${variable.enabled ? "checked" : ""} />
        <span class="variable-toggle-ui" aria-hidden="true"></span>
      </label>
      ${renderVariableSecretButton(variable)}
      <div class="variable-field variable-field-name">
        <input class="variable-name" value="${escapeAttribute(variable.name)}" placeholder="${labels.namePlaceholder}" spellcheck="false" autocomplete="off" />
      </div>
      <div class="variable-field variable-field-token">
        ${tokenMarkup}
      </div>
      <div class="variable-field variable-field-value">
        ${renderVariableValueInput(variable, labels.valuePlaceholder)}
      </div>
      <button class="mini-btn variable-remove" type="button" aria-label="${t().tree.delete}">${iconRemove}</button>
    </div>
  `;
}

function bindEnvironmentsPanel(root: HTMLElement, onVariablesChanged?: VariableChangeHandler) {
  const refreshEditor = () => {
    const editor = root.querySelector("[data-env-editor]");
    if (!editor) return;
    const selected = state.envManageSelectedId
      ? state.environments.find((env) => env.id === state.envManageSelectedId)
      : null;
    editor.innerHTML = selected
      ? renderEnvironmentEditor(selected)
      : `<p class="env-manage-empty">${t().environments.selectEnvironment}</p>`;
    if (selected) bindEnvironmentEditor(root, selected, refreshEditor, onVariablesChanged);
  };

  const refreshList = () => {
    const list = root.querySelector(".env-manage-list");
    if (!list) return;
    const selectedId = state.envManageSelectedId;
    if (!state.environments.length) {
      list.innerHTML = `<p class="env-manage-empty">${t().environments.emptyEnvironments}</p>`;
      refreshEditor();
      return;
    }
    list.innerHTML = state.environments
      .map(
        (env) => `
      <button class="env-manage-item${env.id === selectedId ? " active" : ""}" type="button" data-env-select="${env.id}" role="option" aria-selected="${env.id === selectedId}">
        <span class="env-manage-item-name">${escapeHtml(env.name)}</span>
        <span class="env-manage-item-meta">${env.variables.filter((v) => v.enabled && v.name.trim()).length}</span>
      </button>
    `
      )
      .join("");
    bindListSelection(list, refreshEditor, onVariablesChanged);
  };

  root.querySelector("[data-env-add]")?.addEventListener("click", () => {
    const env: Environment = {
      id: id(),
      name: t().environments.newEnvironment,
      variables: []
    };
    state.environments.push(env);
    state.envManageSelectedId = env.id;
    scheduleSave();
    refreshList();
    refreshEditor();
  });

  const list = root.querySelector(".env-manage-list");
  if (list) bindListSelection(list, refreshEditor, onVariablesChanged);

  const selected = state.envManageSelectedId
    ? state.environments.find((env) => env.id === state.envManageSelectedId)
    : null;
  if (selected) bindEnvironmentEditor(root, selected, refreshEditor, onVariablesChanged);
}

function bindListSelection(
  list: ParentNode,
  refreshEditor: () => void,
  onVariablesChanged?: VariableChangeHandler
) {
  list.querySelectorAll<HTMLButtonElement>("[data-env-select]").forEach((button) => {
    button.addEventListener("click", () => {
      state.envManageSelectedId = button.dataset.envSelect ?? null;
      refreshEditor();
      list.querySelectorAll(".env-manage-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      button.setAttribute("aria-selected", "true");
      scheduleSave();
      onVariablesChanged?.();
    });
  });
}

function bindEnvironmentEditor(
  root: HTMLElement,
  environment: Environment,
  refreshEditor: () => void,
  onVariablesChanged?: VariableChangeHandler
) {
  const editor = root.querySelector<HTMLElement>(`[data-env-id="${environment.id}"]`);
  if (!editor) return;

  editor.querySelector<HTMLInputElement>(".env-editor-name")?.addEventListener("input", (event) => {
    environment.name = (event.target as HTMLInputElement).value.trim() || t().environments.newEnvironment;
    scheduleSave();
    refreshListMeta(root);
    onVariablesChanged?.();
  });

  editor.querySelector("[data-env-rename]")?.addEventListener("click", async () => {
    const next = await inputDialog(t().messages.renameTitle, t().messages.renameBody, environment.name);
    if (next === "cancel" || !next.trim()) return;
    environment.name = next.trim();
    scheduleSave();
    refreshListMeta(root);
    const nameInput = editor.querySelector<HTMLInputElement>(".env-editor-name");
    if (nameInput) nameInput.value = environment.name;
    onVariablesChanged?.();
  });

  editor.querySelector("[data-env-delete]")?.addEventListener("click", async () => {
    const labels = t().environments;
    const answer = await messageDialog(
      "confirmation",
      labels.deleteEnvironmentTitle,
      labels.deleteEnvironmentBody.replace("{name}", environment.name)
    );
    if (answer !== "confirm") return;
    state.environments = state.environments.filter((env) => env.id !== environment.id);
    if (state.activeEnvironmentId === environment.id) state.activeEnvironmentId = null;
    state.envManageSelectedId = state.environments[0]?.id ?? null;
    scheduleSave();
    refreshListFromRoot(root, onVariablesChanged);
    onVariablesChanged?.();
  });

  editor.querySelector("[data-env-var-add]")?.addEventListener("click", () => {
    environment.variables.push({ id: id(), name: "", value: "", enabled: true });
    const existing = editor.querySelector(".env-manage-var-table");
    if (existing) {
      existing.outerHTML = renderManageVariableList(environment.variables);
    } else {
      editor.insertAdjacentHTML("beforeend", renderManageVariableList(environment.variables));
    }
    bindManageVariableList(editor, environment.variables, onVariablesChanged);
    scheduleSave();
    onVariablesChanged?.();
  });

  bindManageVariableList(editor, environment.variables, onVariablesChanged);
}

function refreshListMeta(root: HTMLElement) {
  const selectedId = state.envManageSelectedId;
  root.querySelectorAll<HTMLElement>(".env-manage-item").forEach((item) => {
    const envId = item.dataset.envSelect;
    const env = state.environments.find((entry) => entry.id === envId);
    if (!env) return;
    const name = item.querySelector(".env-manage-item-name");
    const meta = item.querySelector(".env-manage-item-meta");
    if (name) name.textContent = env.name;
    if (meta) meta.textContent = String(env.variables.filter((v) => v.enabled && v.name.trim()).length);
    item.classList.toggle("active", env.id === selectedId);
  });
}

function refreshListFromRoot(root: HTMLElement, onVariablesChanged?: VariableChangeHandler) {
  const list = root.querySelector(".env-manage-list");
  if (!list) return;
  const selectedId = state.envManageSelectedId;
  if (!state.environments.length) {
    list.innerHTML = `<p class="env-manage-empty">${t().environments.emptyEnvironments}</p>`;
  } else {
    list.innerHTML = state.environments
      .map(
        (env) => `
      <button class="env-manage-item${env.id === selectedId ? " active" : ""}" type="button" data-env-select="${env.id}">
        <span class="env-manage-item-name">${escapeHtml(env.name)}</span>
        <span class="env-manage-item-meta">${env.variables.filter((v) => v.enabled && v.name.trim()).length}</span>
      </button>
    `
      )
      .join("");
    bindListSelection(list, () => refreshListFromRoot(root, onVariablesChanged), onVariablesChanged);
  }
  const editor = root.querySelector("[data-env-editor]");
  const selected = selectedId ? state.environments.find((env) => env.id === selectedId) : null;
  if (editor) {
    editor.innerHTML = selected
      ? renderEnvironmentEditor(selected)
      : `<p class="env-manage-empty">${t().environments.selectEnvironment}</p>`;
    if (selected) bindEnvironmentEditor(root, selected, () => refreshListFromRoot(root, onVariablesChanged), onVariablesChanged);
  }
}

function bindManageVariableList(root: ParentNode, variables: Variable[], onVariablesChanged?: VariableChangeHandler) {
  root.querySelectorAll<HTMLElement>(".env-manage-var-row[data-variable-id]").forEach((row) => {
    const variable = variables.find((item) => item.id === row.dataset.variableId);
    if (!variable) return;
    if ((row as HTMLElement & { dataset: { bound?: string } }).dataset.bound === "true") return;
    (row as HTMLElement & { dataset: { bound?: string } }).dataset.bound = "true";

    const syncToken = () => {
      const tokenHost = row.querySelector(".variable-field-token");
      if (!tokenHost) return;
      const trimmed = variable.name.trim();
      tokenHost.innerHTML = trimmed
        ? `<code class="variable-token">${escapeHtml(`\${${trimmed}}`)}</code>`
        : `<span class="variable-token variable-token-empty">—</span>`;
    };

    row.querySelector<HTMLInputElement>(".variable-enabled")?.addEventListener("change", (event) => {
      variable.enabled = (event.target as HTMLInputElement).checked;
      row.classList.toggle("is-disabled", !variable.enabled);
      scheduleSave();
      onVariablesChanged?.();
    });

    row.querySelector<HTMLInputElement>(".variable-name")?.addEventListener("input", (event) => {
      variable.name = (event.target as HTMLInputElement).value;
      syncToken();
      scheduleSave();
      onVariablesChanged?.();
    });

    row.querySelector<HTMLInputElement>(".variable-value")?.addEventListener("input", (event) => {
      variable.value = (event.target as HTMLInputElement).value;
      scheduleSave();
      onVariablesChanged?.();
    });

    bindVariableSecretToggle(row, variable, () => {
      scheduleSave();
      onVariablesChanged?.();
    });
    syncVariableRowSecretUi(row, variable);

    row.querySelector(".variable-remove")?.addEventListener("click", () => {
      const index = variables.findIndex((item) => item.id === variable.id);
      if (index >= 0) variables.splice(index, 1);
      row.remove();
      const table = root.querySelector(".env-manage-var-table");
      if (table && !table.querySelector(".env-manage-var-row")) {
        table.outerHTML = `<p class="env-manage-empty">${t().variables.emptyTitle}</p>`;
      }
      scheduleSave();
      onVariablesChanged?.();
    });
  });
}

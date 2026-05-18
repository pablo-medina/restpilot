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
      <div class="variable-field variable-field-name">
        <input class="variable-name" value="${escapeAttribute(variable.name)}" placeholder="${labels.namePlaceholder}" spellcheck="false" autocomplete="off" />
      </div>
      <div class="variable-field variable-field-value">
        ${renderVariableValueInput(variable, labels.valuePlaceholder)}
        ${renderVariableSecretButton(variable)}
      </div>
      <button class="mini-btn field-remove-btn variable-remove remove-variable" type="button" aria-label="${t().tree.delete}">×</button>
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
        <span>${labels.colName}</span>
        <span>${labels.colValue}</span>
        <span></span>
      </div>
      <div class="variables-list">
        ${variables.map((variable) => renderGlobalVariableItem(variable)).join("")}
        <div class="variables-search-empty is-hidden">${t().variables.noResults ?? "No matching variables found."}</div>
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
    <article class="variables-panel">
      <div class="variables-panel-head">
        <div class="variables-search-wrap">
          <input type="search" class="variables-search-input" placeholder="${labels.searchPlaceholder ?? 'Search variables...'}" spellcheck="false" autocomplete="off" />
        </div>
        ${total ? `<span class="variables-panel-meta">${formatVariablesStats(total, active)}</span>` : ""}
        ${total ? `<button class="variables-add-btn" id="add-variable" type="button"><span class="variables-add-icon" aria-hidden="true">+</span>${labels.add}</button>` : ""}
      </div>
      ${listMarkup}
    </article>
  `;
}

function renderEnvironmentsTab() {
  const labels = t().environments;
  const selectedId = state.envManageSelectedId;
  const selected = selectedId ? state.environments.find((env) => env.id === selectedId) : null;

  const selectOptions = state.environments.length
    ? state.environments
        .map(
          (env) => `
      <option value="${env.id}" ${env.id === selectedId ? "selected" : ""}>
        ${escapeHtml(env.name)} (${env.variables.filter((v) => v.enabled && v.name.trim()).length})
      </option>
    `
        )
        .join("")
    : `<option value="">${labels.emptyEnvironments}</option>`;

  const selectMarkup = `
    <div class="env-selector-wrap">
      <select class="env-selector-dropdown" aria-label="${labels.activeEnvironment}">
        ${selectOptions}
      </select>
    </div>
  `;

  return `
    <div class="env-manage env-manage-panel" data-env-manage>
      <header class="env-manage-toolbar">
        ${selectMarkup}
        <button class="variables-add-btn" type="button" data-env-add><span class="variables-add-icon" aria-hidden="true">+</span>${labels.newEnvironment}</button>
      </header>
      <div class="env-manage-editor" data-env-editor>
        ${selected ? renderEnvironmentEditor(selected) : `<p class="env-manage-empty">${labels.selectEnvironment}</p>`}
      </div>
    </div>
  `;
}

export function renderVariablesWorkspace() {
  const envLabels = t().environments;
  return `
    <section class="variables-view variables-workspace">
      <div class="variables-workspace-columns">
        <div class="variables-workspace-col variables-workspace-globals">
          <div class="variables-column-title-row">
            <h2 class="variables-column-title">${envLabels.tabGlobals}</h2>
          </div>
          ${renderGlobalsTab()}
        </div>
        <div class="variables-workspace-col variables-workspace-environments">
          <div class="variables-column-title-row">
            <h2 class="variables-column-title">${envLabels.tabEnvironments}</h2>
          </div>
          ${renderEnvironmentsTab()}
        </div>
      </div>
    </section>
  `;
}

export function bindVariablesWorkspace(onVariablesChanged?: VariableChangeHandler) {
  bindGlobalsTab(onVariablesChanged);
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

  const searchInput = document.querySelector<HTMLInputElement>(".variables-search-input");
  if (searchInput) {
    const performFilter = () => {
      const query = searchInput.value.trim().toLowerCase();
      const rows = document.querySelectorAll<HTMLElement>(".variables-list .variable-item");
      let visibleCount = 0;
      rows.forEach((row) => {
        const name = row.querySelector<HTMLInputElement>(".variable-name")?.value.toLowerCase() ?? "";
        const val = row.querySelector<HTMLInputElement>(".variable-value")?.value.toLowerCase() ?? "";
        const matches = name.includes(query) || val.includes(query);
        row.classList.toggle("is-hidden", !matches);
        if (matches) visibleCount++;
      });
      const emptyMsg = document.querySelector<HTMLElement>(".variables-search-empty");
      if (emptyMsg) {
        emptyMsg.classList.toggle("is-hidden", visibleCount > 0 || rows.length === 0);
      }
    };
    searchInput.addEventListener("input", performFilter);
  }

  document.querySelectorAll<HTMLElement>(".variable-item[data-variable-id]").forEach((row) => {
    const variable = state.variables.find((item) => item.id === row.dataset.variableId);
    if (!variable) return;

    row.querySelectorAll<HTMLInputElement>("input:not([type='checkbox'])").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          input.blur();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const isUp = event.key === "ArrowUp";
          const list = row.parentElement;
          if (!list) return;
          const rows = Array.from(list.children) as HTMLElement[];
          const rowIndex = rows.indexOf(row);
          if (rowIndex < 0) return;
          const targetRow = rows[rowIndex + (isUp ? -1 : 1)];
          if (targetRow) {
            const rowInputs = Array.from(row.querySelectorAll("input:not([type='checkbox'])"));
            const colIndex = rowInputs.indexOf(input);
            const targetInput = targetRow.querySelectorAll("input:not([type='checkbox'])")[colIndex] as HTMLInputElement;
            if (targetInput) {
              event.preventDefault();
              targetInput.focus();
            }
          }
        }
      });
    });

    row.querySelector<HTMLInputElement>(".variable-enabled")?.addEventListener("change", (event) => {
      variable.enabled = (event.target as HTMLInputElement).checked;
      row.classList.toggle("is-disabled", !variable.enabled);
      scheduleSave();
      onVariablesChanged?.();
    });

    row.querySelector<HTMLInputElement>(".variable-name")?.addEventListener("input", (event) => {
      variable.name = (event.target as HTMLInputElement).value;
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
  const varLabels = t().variables;
  return `
    <div class="env-editor" data-env-id="${environment.id}">
      <div class="env-editor-head">
        <input class="env-editor-name" value="${escapeAttribute(environment.name)}" spellcheck="false" aria-label="${labels.environmentName}" />
        <div class="env-editor-actions">
          <div class="variables-search-wrap">
            <input type="search" class="env-search-input" placeholder="${varLabels.searchPlaceholder ?? 'Search variables...'}" spellcheck="false" autocomplete="off" />
          </div>
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
        <span>${labels.colName}</span>
        <span>${labels.colValue}</span>
        <span></span>
      </div>
      <div class="env-manage-var-list">
        ${variables.map((variable) => renderManageVariableRow(variable)).join("")}
        <div class="variables-search-empty is-hidden">${t().variables.noResults ?? "No matching variables found."}</div>
      </div>
    </div>
  `;
}

function renderManageVariableRow(variable: Variable): string {
  const labels = t().variables;
  const disabledClass = variable.enabled ? "" : " is-disabled";
  const secretClass = variable.secret ? " is-secret" : "";

  return `
    <div class="variable-item env-manage-var-row${disabledClass}${secretClass}" data-variable-id="${variable.id}">
      <label class="variable-toggle" title="${labels.colEnabled}">
        <input class="variable-enabled" type="checkbox" ${variable.enabled ? "checked" : ""} />
        <span class="variable-toggle-ui" aria-hidden="true"></span>
      </label>
      <div class="variable-field variable-field-name">
        <input class="variable-name" value="${escapeAttribute(variable.name)}" placeholder="${labels.namePlaceholder}" spellcheck="false" autocomplete="off" />
      </div>
      <div class="variable-field variable-field-value">
        ${renderVariableValueInput(variable, labels.valuePlaceholder)}
        ${renderVariableSecretButton(variable)}
      </div>
      <button class="mini-btn field-remove-btn variable-remove" type="button" aria-label="${t().tree.delete}">×</button>
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

  const refreshDropdown = () => {
    const dropdown = root.querySelector<HTMLSelectElement>(".env-selector-dropdown");
    if (!dropdown) return;
    const selectedId = state.envManageSelectedId;
    if (!state.environments.length) {
      dropdown.innerHTML = `<option value="">${t().environments.emptyEnvironments}</option>`;
      refreshEditor();
      return;
    }
    dropdown.innerHTML = state.environments
      .map(
        (env) => `
      <option value="${env.id}" ${env.id === selectedId ? "selected" : ""}>
        ${escapeHtml(env.name)} (${env.variables.filter((v) => v.enabled && v.name.trim()).length})
      </option>
    `
      )
      .join("");
  };

  root.querySelector(".env-selector-dropdown")?.addEventListener("change", (event) => {
    state.envManageSelectedId = (event.target as HTMLSelectElement).value || null;
    scheduleSave();
    onVariablesChanged?.();
    refreshEditor();
  });

  root.querySelector("[data-env-add]")?.addEventListener("click", () => {
    const env: Environment = {
      id: id(),
      name: t().environments.newEnvironment,
      variables: []
    };
    state.environments.push(env);
    state.envManageSelectedId = env.id;
    scheduleSave();
    rerenderVariablesWorkspace(onVariablesChanged);
  });

  const selected = state.envManageSelectedId
    ? state.environments.find((env) => env.id === state.envManageSelectedId)
    : null;
  if (selected) bindEnvironmentEditor(root, selected, refreshEditor, onVariablesChanged);
}

function bindEnvironmentEditor(
  root: HTMLElement,
  environment: Environment,
  refreshEditor: () => void,
  onVariablesChanged?: VariableChangeHandler
) {
  const editor = root.querySelector<HTMLElement>(`[data-env-id="${environment.id}"]`);
  if (!editor) return;

  const searchInput = editor.querySelector<HTMLInputElement>(".env-search-input");
  if (searchInput) {
    const performFilter = () => {
      const query = searchInput.value.trim().toLowerCase();
      const rows = editor.querySelectorAll<HTMLElement>(".env-manage-var-list .variable-item");
      let visibleCount = 0;
      rows.forEach((row) => {
        const name = row.querySelector<HTMLInputElement>(".variable-name")?.value.toLowerCase() ?? "";
        const val = row.querySelector<HTMLInputElement>(".variable-value")?.value.toLowerCase() ?? "";
        const matches = name.includes(query) || val.includes(query);
        row.classList.toggle("is-hidden", !matches);
        if (matches) visibleCount++;
      });
      const emptyMsg = editor.querySelector<HTMLElement>(".variables-search-empty");
      if (emptyMsg) {
        emptyMsg.classList.toggle("is-hidden", visibleCount > 0 || rows.length === 0);
      }
    };
    searchInput.addEventListener("input", performFilter);
  }

  editor.querySelector<HTMLInputElement>(".env-editor-name")?.addEventListener("input", (event) => {
    environment.name = (event.target as HTMLInputElement).value.trim() || t().environments.newEnvironment;
    scheduleSave();
    const dropdown = root.querySelector<HTMLSelectElement>(".env-selector-dropdown");
    if (dropdown) {
      const option = dropdown.querySelector(`option[value="${environment.id}"]`);
      if (option) {
        option.textContent = `${environment.name} (${environment.variables.filter((v) => v.enabled && v.name.trim()).length})`;
      }
    }
    onVariablesChanged?.();
  });

  editor.querySelector("[data-env-rename]")?.addEventListener("click", async () => {
    const next = await inputDialog(t().messages.renameTitle, t().messages.renameBody, environment.name);
    if (next === "cancel" || !next.trim()) return;
    environment.name = next.trim();
    scheduleSave();
    rerenderVariablesWorkspace(onVariablesChanged);
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
    rerenderVariablesWorkspace(onVariablesChanged);
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

function bindManageVariableList(root: ParentNode, variables: Variable[], onVariablesChanged?: VariableChangeHandler) {
  root.querySelectorAll<HTMLElement>(".env-manage-var-row[data-variable-id]").forEach((row) => {
    const variable = variables.find((item) => item.id === row.dataset.variableId);
    if (!variable) return;
    if ((row as HTMLElement & { dataset: { bound?: string } }).dataset.bound === "true") return;
    (row as HTMLElement & { dataset: { bound?: string } }).dataset.bound = "true";

    row.querySelectorAll<HTMLInputElement>("input:not([type='checkbox'])").forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          input.blur();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const isUp = event.key === "ArrowUp";
          const list = row.parentElement;
          if (!list) return;
          const rows = Array.from(list.children) as HTMLElement[];
          const rowIndex = rows.indexOf(row);
          if (rowIndex < 0) return;
          const targetRow = rows[rowIndex + (isUp ? -1 : 1)];
          if (targetRow) {
            const rowInputs = Array.from(row.querySelectorAll("input:not([type='checkbox'])"));
            const colIndex = rowInputs.indexOf(input);
            const targetInput = targetRow.querySelectorAll("input:not([type='checkbox'])")[colIndex] as HTMLInputElement;
            if (targetInput) {
              event.preventDefault();
              targetInput.focus();
            }
          }
        }
      });
    });

    row.querySelector<HTMLInputElement>(".variable-enabled")?.addEventListener("change", (event) => {
      variable.enabled = (event.target as HTMLInputElement).checked;
      row.classList.toggle("is-disabled", !variable.enabled);
      scheduleSave();
      onVariablesChanged?.();
    });

    row.querySelector<HTMLInputElement>(".variable-name")?.addEventListener("input", (event) => {
      variable.name = (event.target as HTMLInputElement).value;
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

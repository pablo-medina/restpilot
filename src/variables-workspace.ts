import { inputDialog, messageDialog } from "./components/dialogs";
import { escapeHtml } from "./content-display";
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
      <div class="variables-empty" style="padding: 48px 32px;">
        <div class="variables-empty-icon" aria-hidden="true">{ }</div>
        <h2>${labels.emptyTitle}</h2>
        <p>${labels.emptyBody}</p>
        <button class="variables-add-btn" id="add-variable-empty" type="button">${labels.addFirst}</button>
      </div>
    `;

  return `
    <article class="variables-panel" style="flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 0;">
      <div class="variables-panel-head" style="padding: 8px 12px; border-bottom: 1px solid var(--rp-border); background: var(--rp-chrome); min-height: 45px; box-sizing: border-box;">
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

function renderDefaultEnvironmentEditorPanel(): string {
  const labels = t().environments;
  const isSelectedActive = state.activeEnvironmentId === null;

  const activeStatusMarkup = isSelectedActive
    ? `
      <span class="env-status-badge active" style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #2e7d32; background: rgba(46, 125, 50, 0.1); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(46, 125, 50, 0.2); height: 24px; box-sizing: border-box; text-transform: uppercase; letter-spacing: 0.03em;">
        <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #2e7d32; box-shadow: 0 0 6px #2e7d32;"></span>
        ${escapeHtml(labels.active || "Activo")}
      </span>
    `
    : `
      <button class="segmented-btn env-activate-btn" type="button" data-env-activate style="padding: 0 10px; font-size: 11px; border-radius: 20px; border: 1px solid var(--rp-border); background: var(--rp-surface); color: var(--rp-text); cursor: pointer; font-weight: 600; transition: all 0.15s; height: 24px; box-sizing: border-box;">
        ${escapeHtml(labels.activate || "Establecer como activo")}
      </button>
    `;

  return `
    <div class="variables-panel" style="flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 0;">
      <header class="env-manage-toolbar" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--rp-border); padding: 8px 12px; background: var(--rp-chrome); min-height: 45px; box-sizing: border-box;">
        <span style="font-size: 13px; font-weight: 700; color: var(--rp-text);">${escapeHtml(labels.defaultEnvironment || "Por defecto (Sin entorno)")}</span>
        ${activeStatusMarkup}
      </header>
      <div class="env-editor default-env-editor" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 32px; text-align: center; color: var(--rp-text-muted); background: var(--rp-surface);">
        <div style="font-size: 42px; margin-bottom: 16px; opacity: 0.6;">🌐</div>
        <h3 style="font-size: 15px; font-weight: 700; color: var(--rp-text); margin: 0 0 8px 0;">
          ${escapeHtml(labels.defaultEnvironment || "Por defecto (Sin entorno)")}
        </h3>
        <p style="font-size: 12px; max-width: 340px; line-height: 1.6; margin: 0;">
          ${escapeHtml(labels.defaultEnvDesc || "Este es el ámbito global básico. No hay variables específicas de entorno activas. Las solicitudes usarán únicamente las variables globales definidas a la izquierda.")}
        </p>
      </div>
    </div>
  `;
}

function renderEnvironmentEditorPanel(environment: Environment): string {
  const labels = t().environments;
  const varLabels = t().variables;
  const isSelectedActive = state.activeEnvironmentId === environment.id;

  const activeStatusMarkup = isSelectedActive
    ? `
      <span class="env-status-badge active" style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #2e7d32; background: rgba(46, 125, 50, 0.1); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(46, 125, 50, 0.2); height: 24px; box-sizing: border-box; text-transform: uppercase; letter-spacing: 0.03em;">
        <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #2e7d32; box-shadow: 0 0 6px #2e7d32;"></span>
        ${escapeHtml(labels.active || "Activo")}
      </span>
    `
    : `
      <button class="segmented-btn env-activate-btn" type="button" data-env-activate style="padding: 0 10px; font-size: 11px; border-radius: 20px; border: 1px solid var(--rp-border); background: var(--rp-surface); color: var(--rp-text); cursor: pointer; font-weight: 600; transition: all 0.15s; height: 24px; box-sizing: border-box;">
        ${escapeHtml(labels.activate || "Establecer como activo")}
      </button>
    `;

  return `
    <div class="variables-panel env-editor" data-env-id="${environment.id}" style="flex: 1; display: flex; flex-direction: column; min-height: 0; gap: 0;">
      <header class="env-manage-toolbar" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--rp-border); padding: 8px 12px; background: var(--rp-chrome); min-height: 45px; box-sizing: border-box;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <input class="env-editor-name" value="${escapeAttribute(environment.name)}" spellcheck="false" aria-label="${labels.environmentName}" style="border: none; background: transparent; font-size: 13px; font-weight: 700; color: var(--rp-text); padding: 2px 6px; height: 28px; outline: none; border-radius: 4px;" />
          ${activeStatusMarkup}
        </div>
        
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="variables-search-wrap">
            <input type="search" class="env-search-input" placeholder="${varLabels.searchPlaceholder ?? 'Search variables...'}" spellcheck="false" autocomplete="off" />
          </div>
          <button class="quiet-button compact" type="button" data-env-rename style="font-size: 12px; font-weight: 500; cursor: pointer; padding: 4px 8px;">${labels.rename}</button>
          <button class="quiet-button compact danger-text" type="button" data-env-delete style="font-size: 12px; font-weight: 500; cursor: pointer; padding: 4px 8px; color: #b54a3a;">${labels.deleteEnvironment}</button>
          <button class="variables-add-btn" type="button" data-env-var-add style="height: 28px; padding: 0 12px; font-size: 12px;"><span class="variables-add-icon" aria-hidden="true">+</span>${labels.addVariable}</button>
        </div>
      </header>
      ${renderManageVariableList(environment.variables)}
    </div>
  `;
}

function renderManageVariableList(variables: Variable[]): string {
  const labels = t().variables;
  const envLabels = t().environments;
  if (!variables.length) {
    return `
      <div class="variables-empty" style="padding: 48px 32px; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--rp-surface);">
        <div class="variables-empty-icon" aria-hidden="true" style="font-size: 32px; margin-bottom: 12px; opacity: 0.6;">{ }</div>
        <h2 style="font-size: 14px; font-weight: 700; color: var(--rp-text); margin: 0 0 4px 0;">${escapeHtml(envLabels.noVariables || "Sin variables")}</h2>
        <p style="font-size: 12px; color: var(--rp-text-muted); margin: 0 0 16px 0; max-width: 280px; line-height: 1.4; text-align: center;">
          ${escapeHtml(envLabels.noVariablesDesc || "Este entorno no tiene variables configuradas aún.")}
        </p>
        <button class="variables-add-btn" type="button" data-env-var-add style="height: 28px; padding: 0 12px; font-size: 12px;">
          <span class="variables-add-icon" aria-hidden="true">+</span>${escapeHtml(labels.add || "Agregar variable")}
        </button>
      </div>
    `;
  }
  return `
    <div class="env-manage-var-table" style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
      <div class="env-manage-var-head" aria-hidden="true" style="display: grid; grid-template-columns: 46px minmax(140px, 1fr) minmax(180px, 1.5fr) var(--field-remove-size); align-items: center; gap: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0 12px; border-bottom: 1px solid var(--rp-border); color: var(--rp-text-muted); height: 36px; max-height: 36px; background: var(--rp-chrome-elevated); box-sizing: border-box;">
        <span>${labels.colEnabled}</span>
        <span>${labels.colName}</span>
        <span>${labels.colValue}</span>
        <span></span>
      </div>
      <div class="env-manage-var-list" style="flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0; background: var(--rp-surface);">
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

export function renderVariablesWorkspace() {
  const envLabels = t().environments;
  const selectedId = state.envManageSelectedId ?? "globals";

  // Sidebar Layout
  const sidebarHtml = `
    <aside class="variables-workspace-sidebar" style="display: flex; flex-direction: column; gap: 16px;">
      <!-- Globals Section -->
      <div class="variables-sidebar-section">
        <button class="variables-sidebar-item ${selectedId === "globals" ? "is-selected" : ""}" type="button" data-scope-select="globals" tabindex="0">
          <span>${escapeHtml(envLabels.tabGlobals || "Globales")}</span>
        </button>
      </div>

      <!-- Environments Section -->
      <div class="variables-sidebar-section" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
        <div class="variables-sidebar-header-row">
          <h3 class="variables-sidebar-title">${escapeHtml(envLabels.environmentsSection || "Entornos")}</h3>
          <button class="mini-btn" type="button" data-scope-add-env title="${escapeHtml(envLabels.newEnvironment)}" style="padding: 2px 6px; font-size: 14px; font-weight: bold; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;">+</button>
        </div>
        
        <div class="variables-sidebar-scroll" style="flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 2px;">
          <!-- Default environment scope -->
          <button class="variables-sidebar-item ${selectedId === "default" ? "is-selected" : ""}" type="button" data-scope-select="default" tabindex="0">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${escapeHtml(envLabels.defaultEnvironment || "Por defecto")}</span>
            ${state.activeEnvironmentId === null ? '<span class="variables-sidebar-active-indicator" title="Activo"></span>' : ''}
          </button>

          <!-- User environments -->
          ${state.environments.map(env => {
            const isActive = state.activeEnvironmentId === env.id;
            const isEditing = state.editingEnvId === env.id;
            
            if (isEditing) {
              return `
                <div class="variables-sidebar-item is-editing" style="padding: 2px 4px; display: flex; align-items: center; width: 100%; box-sizing: border-box; background: var(--rp-chrome); border-radius: 4px; height: 32px;">
                  <input class="env-rename-input" value="${escapeAttribute(env.name)}" data-env-rename-id="${env.id}" spellcheck="false" style="width: 100%; height: 24px; font-size: 12px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--rp-accent); background: var(--rp-input-bg); color: var(--rp-text); outline: none; box-sizing: border-box;" />
                </div>
              `;
            }
            
            return `
              <button class="variables-sidebar-item ${selectedId === env.id ? "is-selected" : ""}" type="button" data-scope-select="${env.id}" tabindex="0">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 145px;" title="${escapeHtml(env.name)}">${escapeHtml(env.name)}</span>
                ${isActive ? '<span class="variables-sidebar-active-indicator" title="Activo"></span>' : ''}
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </aside>
  `;

  // Content Area
  let contentHtml = "";
  if (selectedId === "globals") {
    contentHtml = renderGlobalsTab();
  } else if (selectedId === "default") {
    contentHtml = renderDefaultEnvironmentEditorPanel();
  } else {
    const env = state.environments.find(e => e.id === selectedId);
    contentHtml = env ? renderEnvironmentEditorPanel(env) : renderDefaultEnvironmentEditorPanel();
  }

  return `
    <section class="variables-view variables-workspace">
      <div class="variables-workspace-columns">
        ${sidebarHtml}
        <div class="variables-workspace-content">
          ${contentHtml}
        </div>
      </div>
    </section>
  `;
}

export function commitEnvironmentRename(envId: string, newName: string, onVariablesChanged?: VariableChangeHandler) {
  const duplicate = state.environments.find(e => e.id !== envId && e.name.trim().toLowerCase() === newName.trim().toLowerCase());
  if (duplicate) {
    void messageDialog(
      "warning",
      t().environments.duplicateWarningTitle || "Nombre de entorno duplicado",
      t().environments.duplicateWarningBody?.replace("{name}", newName.trim()) || `Un entorno con el nombre "${newName.trim()}" ya existe. Por favor elija un nombre único.`
    );
    state.editingEnvId = null;
    rerenderVariablesWorkspace(onVariablesChanged);
    return;
  }

  const env = state.environments.find(e => e.id === envId);
  if (env) {
    env.name = newName.trim();
  }
  state.editingEnvId = null;
  scheduleSave();
  onVariablesChanged?.();
  rerenderVariablesWorkspace(onVariablesChanged);
}

export function bindVariablesWorkspace(onVariablesChanged?: VariableChangeHandler) {
  const root = document.querySelector<HTMLElement>(".variables-workspace");
  if (!root) return;

  // Bind Sidebar scope selectors
  root.querySelectorAll<HTMLButtonElement>("[data-scope-select]").forEach(btn => {
    btn.addEventListener("click", () => {
      const scope = btn.dataset.scopeSelect ?? "globals";
      state.envManageSelectedId = scope;
      scheduleSave();
      onVariablesChanged?.();
      rerenderVariablesWorkspace(onVariablesChanged);
    });
  });

  // Bind Sidebar Add Environment
  root.querySelector("[data-scope-add-env]")?.addEventListener("click", () => {
    let dupName: string = t().environments.newEnvironment;
    let counter = 1;
    while (state.environments.some(item => item.name.trim().toLowerCase() === dupName.trim().toLowerCase())) {
      dupName = `${t().environments.newEnvironment} (${counter++})`;
    }

    const env: Environment = {
      id: id(),
      name: dupName,
      variables: []
    };
    state.environments.push(env);
    state.envManageSelectedId = env.id;
    scheduleSave();
    rerenderVariablesWorkspace(onVariablesChanged);
  });

  // Bind Activation button
  root.querySelector("[data-env-activate]")?.addEventListener("click", () => {
    const scope = state.envManageSelectedId;
    if (scope === "default" || scope === "globals" || !scope) {
      state.activeEnvironmentId = null;
    } else {
      state.activeEnvironmentId = scope;
    }
    scheduleSave();
    onVariablesChanged?.();
    rerenderVariablesWorkspace(onVariablesChanged);
  });

  // Keyboard navigation for sidebar items
  const sidebar = root.querySelector<HTMLElement>(".variables-workspace-sidebar");
  sidebar?.addEventListener("keydown", (event) => {
    const active = document.activeElement as HTMLElement;
    if (!active || !active.classList.contains("variables-sidebar-item")) return;

    const items = Array.from(sidebar.querySelectorAll<HTMLElement>(".variables-sidebar-item"));
    const index = items.indexOf(active);
    if (index < 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = items[index + 1] ?? items[0];
      next?.click();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = items[index - 1] ?? items[items.length - 1];
      prev?.click();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      active.click();
    } else if (event.key === "F2") {
      const scopeId = active.dataset.scopeSelect;
      if (scopeId && scopeId !== "globals" && scopeId !== "default") {
        event.preventDefault();
        state.editingEnvId = scopeId;
        rerenderVariablesWorkspace(onVariablesChanged);
      }
    }
  });

  // F2 Inline renaming input binding
  if (state.editingEnvId) {
    const input = root.querySelector<HTMLInputElement>(`[data-env-rename-id="${state.editingEnvId}"]`);
    if (input) {
      input.focus();
      input.select();
      
      const commit = () => {
        const value = input.value.trim();
        if (value && value !== state.environments.find(e => e.id === state.editingEnvId)?.name) {
          commitEnvironmentRename(state.editingEnvId!, value, onVariablesChanged);
        } else {
          state.editingEnvId = null;
          rerenderVariablesWorkspace(onVariablesChanged);
        }
      };

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          state.editingEnvId = null;
          rerenderVariablesWorkspace(onVariablesChanged);
        }
      });

      input.addEventListener("blur", () => {
        commit();
      });
    }
  }

  // Bind right-click custom context menus for environments sidebar items
  root.querySelectorAll<HTMLElement>("[data-scope-select]").forEach(btn => {
    const scopeId = btn.dataset.scopeSelect;
    if (!scopeId || scopeId === "globals" || scopeId === "default") return;

    btn.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();

      document.querySelectorAll(".env-context-menu").forEach(el => el.remove());

      const contextMenu = document.createElement("div");
      contextMenu.className = "context-menu env-context-menu";
      contextMenu.style.position = "fixed";
      contextMenu.style.left = `${event.clientX}px`;
      contextMenu.style.top = `${event.clientY}px`;
      contextMenu.style.zIndex = "100000";

      contextMenu.innerHTML = `
        <button class="context-menu-item" type="button" data-action="rename">
          <span class="context-menu-label">${escapeHtml(t().environments.rename || "Renombrar")}</span>
          <span class="context-menu-shortcut">F2</span>
        </button>
        <button class="context-menu-item" type="button" data-action="duplicate">
          <span class="context-menu-label">${escapeHtml(t().environments.duplicate || "Duplicar")}</span>
        </button>
        <hr>
        <button class="context-menu-item danger" type="button" data-action="delete">
          <span class="context-menu-label">${escapeHtml(t().environments.deleteEnvironment || "Eliminar")}</span>
        </button>
      `;

      document.body.appendChild(contextMenu);

      const removeMenu = () => contextMenu.remove();

      contextMenu.querySelector('[data-action="rename"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        removeMenu();
        state.editingEnvId = scopeId;
        rerenderVariablesWorkspace(onVariablesChanged);
      });

      contextMenu.querySelector('[data-action="duplicate"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        removeMenu();
        const env = state.environments.find(item => item.id === scopeId);
        if (!env) return;

        let dupName = `${env.name} (${t().tree.duplicate || "Copia"})`;
        let counter = 1;
        while (state.environments.some(item => item.name.trim().toLowerCase() === dupName.trim().toLowerCase())) {
          dupName = `${env.name} (${t().tree.duplicate || "Copia"} ${counter++})`;
        }

        const newEnv: Environment = {
          id: id(),
          name: dupName,
          variables: env.variables.map(v => ({ ...v, id: id() }))
        };

        state.environments.push(newEnv);
        state.envManageSelectedId = newEnv.id;
        scheduleSave();
        onVariablesChanged?.();
        rerenderVariablesWorkspace(onVariablesChanged);
      });

      contextMenu.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
        e.stopPropagation();
        removeMenu();
        const env = state.environments.find(item => item.id === scopeId);
        if (!env) return;

        const labels = t().environments;
        const answer = await messageDialog(
          "confirmation",
          labels.deleteEnvironmentTitle,
          labels.deleteEnvironmentBody.replace("{name}", env.name)
        );
        if (answer !== "confirm") return;
        state.environments = state.environments.filter((item) => item.id !== env.id);
        if (state.activeEnvironmentId === env.id) state.activeEnvironmentId = null;
        state.envManageSelectedId = "globals";
        scheduleSave();
        onVariablesChanged?.();
        rerenderVariablesWorkspace(onVariablesChanged);
      });

      document.addEventListener("click", removeMenu, { once: true });
    });
  });

  const selectedId = state.envManageSelectedId ?? "globals";
  if (selectedId === "globals") {
    bindGlobalsTab(onVariablesChanged);
  } else if (selectedId !== "default") {
    const env = state.environments.find(e => e.id === selectedId);
    if (env) {
      bindEnvironmentEditor(root, env, onVariablesChanged);
    }
  }
}

function rerenderVariablesWorkspace(onVariablesChanged?: VariableChangeHandler) {
  const host = document.querySelector<HTMLElement>(".variables-workspace");
  if (!host) return;

  const selectedId = state.envManageSelectedId ?? "globals";

  host.outerHTML = renderVariablesWorkspace();
  bindVariablesWorkspace(onVariablesChanged);

  // Always set focus on the selected sidebar item so keyboard navigation is instantly available
  const newRoot = document.querySelector<HTMLElement>(".variables-workspace");
  const target = newRoot?.querySelector<HTMLElement>(`[data-scope-select="${selectedId}"]`);
  target?.focus();
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

function bindEnvironmentEditor(
  root: HTMLElement,
  environment: Environment,
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

  // Renaming inline via top header input with duplicate check
  editor.querySelector<HTMLInputElement>(".env-editor-name")?.addEventListener("change", async (event) => {
    const newName = (event.target as HTMLInputElement).value.trim();
    if (!newName) {
      (event.target as HTMLInputElement).value = environment.name;
      return;
    }
    const duplicate = state.environments.find(e => e.id !== environment.id && e.name.trim().toLowerCase() === newName.toLowerCase());
    if (duplicate) {
      await messageDialog(
        "warning",
        t().environments.duplicateWarningTitle || "Nombre de entorno duplicado",
        t().environments.duplicateWarningBody?.replace("{name}", newName) || `Un entorno con el nombre "${newName}" ya existe. Por favor elija un nombre único.`
      );
      (event.target as HTMLInputElement).value = environment.name;
      return;
    }
    environment.name = newName;
    scheduleSave();
    onVariablesChanged?.();
    rerenderVariablesWorkspace(onVariablesChanged);
  });

  editor.querySelector("[data-env-rename]")?.addEventListener("click", async () => {
    const next = await inputDialog(t().messages.renameTitle, t().messages.renameBody, environment.name);
    if (next === "cancel" || !next.trim()) return;
    
    const newName = next.trim();
    const duplicate = state.environments.find(e => e.id !== environment.id && e.name.trim().toLowerCase() === newName.toLowerCase());
    if (duplicate) {
      await messageDialog(
        "warning",
        t().environments.duplicateWarningTitle || "Nombre de entorno duplicado",
        t().environments.duplicateWarningBody?.replace("{name}", newName) || `Un entorno con el nombre "${newName}" ya existe. Por favor elija un nombre único.`
      );
      return;
    }

    environment.name = newName;
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
    state.envManageSelectedId = "globals";
    scheduleSave();
    rerenderVariablesWorkspace(onVariablesChanged);
    onVariablesChanged?.();
  });

  const add = () => {
    environment.variables.push({ id: id(), name: "", value: "", enabled: true });
    scheduleSave();
    onVariablesChanged?.();
    rerenderVariablesWorkspace(onVariablesChanged);
    requestAnimationFrame(() => {
      const activeEditor = document.querySelector<HTMLElement>(`[data-env-id="${environment.id}"]`);
      if (activeEditor) {
        const rows = activeEditor.querySelectorAll<HTMLElement>(".variable-item");
        const last = rows[rows.length - 1];
        last?.querySelector<HTMLInputElement>(".variable-name")?.focus();
      }
    });
  };

  editor.querySelectorAll("[data-env-var-add]").forEach(btn => {
    btn.addEventListener("click", add);
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

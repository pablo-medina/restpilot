import {
  bindPopoverClose,
  mountPopover,
  removePopovers,
  renderPopoverShell
} from "./components/popover";
import { escapeHtml } from "./content-display";
import { iconVariables } from "./icons";
import { t } from "./i18n";
import { environmentChipLabel, getActiveEnvironment } from "./app/environments";
import { scheduleSave } from "./app/persistence";
import { escapeAttribute, state } from "./app/state";
import type { Variable } from "./types";

export type RequestPopoverKind = "environment" | "variables";
export type VariableChangeHandler = () => void;
type OpenVariablesPanel = (tab: "globals" | "environments") => void;

let handlersBound = false;
let triggerClickBound = false;
let variablesChangedHook: VariableChangeHandler | null = null;
let openVariablesPanelHook: OpenVariablesPanel | null = null;

export function setRequestPopoverHooks(hooks: {
  onVariablesChanged?: VariableChangeHandler;
  openVariablesPanel?: OpenVariablesPanel;
}) {
  variablesChangedHook = hooks.onVariablesChanged ?? null;
  openVariablesPanelHook = hooks.openVariablesPanel ?? null;
}

export function renderEnvironmentChipButton(): string {
  const labels = t().environments;
  const expanded = state.openRequestPopover === "environment";
  return `
    <button
      type="button"
      id="request-env-btn"
      class="env-chip request-popover-trigger${expanded ? " is-active" : ""}"
      title="${labels.chipTitle}"
      aria-haspopup="dialog"
      aria-expanded="${expanded}">
      <span class="env-chip-label">${escapeHtml(environmentChipLabel())}</span>
      <span class="env-chip-caret" aria-hidden="true">▾</span>
    </button>
  `;
}

export function renderVariablesPopoverButton(): string {
  const labels = t().variables;
  const expanded = state.openRequestPopover === "variables";
  return `
    <button
      type="button"
      id="request-vars-btn"
      class="tool-icon request-tool-btn request-popover-trigger${expanded ? " is-active" : ""}"
      title="${labels.popoverTitle}"
      aria-haspopup="dialog"
      aria-expanded="${expanded}">
      ${iconVariables}
    </button>
  `;
}

export function closeRequestPopovers() {
  if (!state.openRequestPopover) return;
  state.openRequestPopover = null;
  removePopovers();
  document.querySelector("#request-env-btn")?.setAttribute("aria-expanded", "false");
  document.querySelector("#request-vars-btn")?.setAttribute("aria-expanded", "false");
  document.querySelector("#request-env-btn")?.classList.remove("is-active");
  document.querySelector("#request-vars-btn")?.classList.remove("is-active");
}

export function syncRequestPopover() {
  removePopovers();
  if (!state.openRequestPopover) return;

  const anchorId = state.openRequestPopover === "environment" ? "#request-env-btn" : "#request-vars-btn";
  const anchor = document.querySelector<HTMLElement>(anchorId);
  if (!anchor) {
    state.openRequestPopover = null;
    return;
  }

  const html =
    state.openRequestPopover === "environment" ? buildEnvironmentPopoverHtml() : buildVariablesPopoverHtml();
  const popover = mountPopover(html, anchor);
  anchor.setAttribute("aria-expanded", "true");
  anchor.classList.add("is-active");

  bindPopoverClose(popover, closeRequestPopovers);
  if (state.openRequestPopover === "environment") {
    bindEnvironmentPopover(popover, variablesChangedHook ?? undefined);
  } else {
    bindVariablesPopover(popover, variablesChangedHook ?? undefined);
  }
}

export function bindRequestPopoverTriggers(onVariablesChanged?: VariableChangeHandler) {
  if (onVariablesChanged) variablesChangedHook = onVariablesChanged;
  ensurePopoverHandlers();
  ensurePopoverTriggerClick();
}

function ensurePopoverTriggerClick() {
  if (triggerClickBound) return;
  triggerClickBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("#request-env-btn")) {
      event.stopPropagation();
      togglePopover("environment");
      return;
    }
    if (target.closest("#request-vars-btn")) {
      event.stopPropagation();
      togglePopover("variables");
    }
  });
}

function togglePopover(kind: RequestPopoverKind) {
  document.querySelector(".context-menu")?.remove();
  state.contextMenu = null;

  if (state.openRequestPopover === kind) {
    closeRequestPopovers();
    return;
  }
  state.openRequestPopover = kind;
  syncRequestPopover();
}

function ensurePopoverHandlers() {
  if (handlersBound) return;
  handlersBound = true;

  document.addEventListener(
    "click",
    (event) => {
      if (!state.openRequestPopover) return;
      const target = event.target as HTMLElement;
      if (target.closest(".app-popover")) return;
      if (target.closest("#request-env-btn") || target.closest("#request-vars-btn")) return;
      closeRequestPopovers();
    },
    true
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.openRequestPopover) {
      event.stopPropagation();
      closeRequestPopovers();
    }
  });
}

const zenStyles = `
<style>
  .zen-popover-item {
    width: 100%; text-align: left; background: transparent; border: none; padding: 6px 10px; border-radius: 6px; font-size: 13px; color: var(--rp-text); cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 8px; transition: background 0.15s ease; box-sizing: border-box; margin-bottom: 2px;
  }
  .zen-popover-item:hover { background: var(--rp-hover); }
  .zen-popover-item.active { background: rgba(61, 127, 111, 0.1); font-weight: 600; color: #3d7f6f; }
  .zen-manage-btn { width: 100%; text-align: center; font-size: 12px; padding: 8px; font-weight: 600; display: block; border: none; background: transparent; cursor: pointer; color: var(--rp-text); transition: background 0.15s ease; border-radius: 6px; }
  .zen-manage-btn:hover { background: var(--rp-hover); }
  .var-list-item.is-disabled { opacity: 0.5; text-decoration: line-through; }
</style>
`;

function buildEnvironmentPopoverHtml(): string {
  const labels = t().environments;

  const items = [
    { id: "", name: labels.noEnvironment || "Sin entorno" },
    ...state.environments
  ];

  const searchInputHtml = `
    <input type="search" class="popover-search env-popover-search" placeholder="${escapeAttribute(t().environments.searchPlaceholder || "Buscar entornos...")}" spellcheck="false" autocomplete="off" style="margin-bottom: 8px;" />
  `;

  const listHtml = `
    <div class="popover-list" style="max-height: 200px; overflow-y: auto;">
      ${items.map(env => {
        const isActive = env.id === (state.activeEnvironmentId || "");
        return `
          <button class="zen-popover-item ${isActive ? "active" : ""}" type="button" data-env-pick="${env.id}">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(env.name)}</span>
            ${isActive ? '<span style="color: #2e7d32; font-weight: bold; font-size: 12px; margin-left: auto;">✓</span>' : ''}
          </button>
        `;
      }).join("")}
    </div>
  `;

  const footer = `
    <div style="padding-top: 8px; border-top: 1px solid var(--rp-border); margin-top: 8px;">
      <button class="zen-manage-btn" type="button" data-env-manage-open>
        ${escapeHtml(labels.manage || "Administrar entornos...")}
      </button>
    </div>
  `;

  return renderPopoverShell({
    className: "env-popover selection-popover",
    title: labels.popoverTitle,
    ariaLabel: labels.popoverTitle,
    bodyHtml: `
      ${zenStyles}
      ${searchInputHtml}
      ${listHtml}
    `,
    footerHtml: footer
  });
}

function buildVariablesPopoverHtml(): string {
  const labels = t().variables;
  const activeEnv = state.environments.find(e => e.id === state.activeEnvironmentId);
  const activeEnvName = activeEnv?.name ?? "";
  const envVars = activeEnv ? activeEnv.variables : [];
  const globals = state.variables;

  const items: { id: string; name: string; enabled: boolean; secret: boolean; scope: "global" | "env" }[] = [];
  if (activeEnv) {
    envVars.forEach((v) => {
      items.push({ id: v.id, name: v.name, enabled: v.enabled, secret: Boolean(v.secret), scope: "env" });
    });
  }
  globals.forEach((v) => {
    items.push({ id: v.id, name: v.name, enabled: v.enabled, secret: Boolean(v.secret), scope: "global" });
  });

  const searchInputHtml = `
    <input type="search" class="popover-search vars-popover-search" placeholder="${escapeAttribute(t().variables.searchPlaceholder || "Buscar variables...")}" spellcheck="false" autocomplete="off" style="margin-bottom: 8px;" />
  `;

  const listHtml = `
    <div class="popover-list" style="max-height: 240px; overflow-y: auto;">
      ${items.length > 0
        ? items.map((v) => {
            const disabledClass = v.enabled ? "" : " is-disabled";
            return `
              <label class="zen-popover-item var-list-item ${disabledClass}" data-variable-id="${v.id}" data-var-scope="${v.scope}" tabindex="0">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(v.name)}</span>
                <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
                  ${v.secret ? '<span style="opacity: 0.5; font-size: 11px;" title="Protegida">🔒</span>' : ''}
                  ${v.scope === "env" 
                    ? `<span style="font-size: 10px; opacity: 0.8; padding: 2px 6px; border-radius: 4px; background: rgba(61, 127, 111, 0.1); color: #3d7f6f; font-weight: 500; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeAttribute(activeEnvName)}">${escapeHtml(activeEnvName)}</span>`
                    : `<span style="font-size: 10px; opacity: 0.6; padding: 2px 6px; border-radius: 4px; background: var(--rp-hover); color: var(--rp-text-muted);">Global</span>`
                  }
                  <input class="variable-enabled" type="checkbox" ${v.enabled ? "checked" : ""} style="margin: 0; cursor: pointer;" />
                </div>
              </label>
            `;
          }).join("")
        : `<p class="popover-empty" style="padding: 16px; text-align: center; color: var(--rp-text-muted); font-size: 12px; font-style: italic; margin: 0;">${labels.emptyTitle}</p>`}
    </div>
  `;

  const footer = `
    <div style="padding-top: 8px; border-top: 1px solid var(--rp-border); margin-top: 8px;">
      <button class="zen-manage-btn" type="button" data-vars-manage-open>
        ${escapeHtml(labels.popoverManage || "Administrar variables...")}
      </button>
    </div>
  `;

  return renderPopoverShell({
    className: "vars-popover selection-popover",
    title: labels.title,
    ariaLabel: labels.popoverTitle,
    bodyHtml: `
      ${zenStyles}
      ${searchInputHtml}
      ${listHtml}
    `,
    footerHtml: footer
  });
}

function bindEnvironmentPopover(popover: HTMLElement, onVariablesChanged?: VariableChangeHandler) {
  popover.querySelectorAll<HTMLButtonElement>("[data-env-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeEnvironmentId = button.dataset.envPick || null;
      scheduleSave();
      onVariablesChanged?.();
      closeRequestPopovers();
    });

    button.addEventListener("keydown", (event) => {
      const visibleItems = Array.from(popover.querySelectorAll<HTMLButtonElement>("[data-env-pick]"))
        .filter(el => el.style.display !== "none");
      const index = visibleItems.indexOf(button);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = visibleItems[index + 1] ?? visibleItems[0];
        next?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prev = visibleItems[index - 1] ?? visibleItems[visibleItems.length - 1];
        prev?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        button.click();
      }
    });
  });

  popover.querySelector("[data-env-manage-open]")?.addEventListener("click", () => {
    closeRequestPopovers();
    openVariablesPanelHook?.("environments");
  });

  const searchInput = popover.querySelector<HTMLInputElement>(".env-popover-search");
  searchInput?.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    popover.querySelectorAll<HTMLButtonElement>("[data-env-pick]").forEach((item) => {
      const text = item.textContent?.toLowerCase() ?? "";
      item.style.display = text.includes(query) ? "flex" : "none";
    });
  });

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const firstVisible = Array.from(popover.querySelectorAll<HTMLButtonElement>("[data-env-pick]"))
        .find(el => el.style.display !== "none");
      firstVisible?.focus();
    }
  });
}

function bindVariablesPopover(popover: HTMLElement, onVariablesChanged?: VariableChangeHandler) {
  popover.querySelector("[data-vars-manage-open]")?.addEventListener("click", () => {
    closeRequestPopovers();
    openVariablesPanelHook?.("globals");
  });

  const searchInput = popover.querySelector<HTMLInputElement>(".vars-popover-search");
  searchInput?.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    popover.querySelectorAll<HTMLElement>(".var-list-item").forEach((item) => {
      const name = item.textContent?.toLowerCase() ?? "";
      item.style.setProperty("display", name.includes(query) ? "flex" : "none", "important");
    });
  });

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const firstVisible = Array.from(popover.querySelectorAll<HTMLElement>(".var-list-item"))
        .find(el => el.style.getPropertyValue("display") !== "none");
      firstVisible?.focus();
    }
  });

  popover.querySelectorAll<HTMLElement>(".var-list-item").forEach((row) => {
    const isGlobal = row.dataset.varScope === "global";
    const varId = row.dataset.variableId;
    let variable: Variable | undefined;

    if (isGlobal) {
      variable = state.variables.find((item) => item.id === varId);
    } else {
      const activeEnv = state.environments.find(e => e.id === state.activeEnvironmentId);
      variable = activeEnv?.variables.find((item) => item.id === varId);
    }

    if (!variable) return;

    row.querySelector<HTMLInputElement>(".variable-enabled")?.addEventListener("change", (event) => {
      variable.enabled = (event.target as HTMLInputElement).checked;
      row.classList.toggle("is-disabled", !variable.enabled);
      scheduleSave();
      onVariablesChanged?.();
    });

    row.addEventListener("keydown", (event) => {
      const visibleItems = Array.from(popover.querySelectorAll<HTMLElement>(".var-list-item"))
        .filter(el => el.style.getPropertyValue("display") !== "none");
      const index = visibleItems.indexOf(row);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = visibleItems[index + 1] ?? visibleItems[0];
        next?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prev = visibleItems[index - 1] ?? visibleItems[visibleItems.length - 1];
        prev?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const chk = row.querySelector<HTMLInputElement>(".variable-enabled");
        if (chk) {
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event("change"));
        }
      }
    });
  });
}

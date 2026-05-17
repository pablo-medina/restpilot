import {
  bindPopoverClose,
  mountPopover,
  removePopovers,
  renderPopoverShell
} from "./components/popover";
import { escapeHtml } from "./content-display";
import { iconRemove, iconVariables } from "./icons";
import { t } from "./i18n";
import {
  bindVariableSecretToggle,
  renderVariableSecretButton,
  renderVariableValueInput,
  syncVariableRowSecretUi
} from "./variable-ui";
import { environmentChipLabel, getActiveEnvironment } from "./app/environments";
import { scheduleSave } from "./app/persistence";
import { escapeAttribute, id, state } from "./app/state";
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

function buildEnvironmentPopoverHtml(): string {
  const labels = t().environments;
  const active = getActiveEnvironment();
  const envVars = active?.variables ?? [];

  const pills = [
    `<button class="env-pill${!state.activeEnvironmentId ? " active" : ""}" type="button" data-env-pick="">${escapeHtml(labels.noEnvironment)}</button>`,
    ...state.environments.map(
      (env) =>
        `<button class="env-pill${env.id === state.activeEnvironmentId ? " active" : ""}" type="button" data-env-pick="${env.id}">${escapeHtml(env.name)}</button>`
    )
  ].join("");

  const varsSection = active
    ? `
      <div class="env-popover-vars">
        <div class="env-popover-vars-head">
          <strong>${escapeHtml(active.name)}</strong>
          <button class="mini-btn" type="button" data-env-popover-add>${labels.addVariable}</button>
        </div>
        <div class="env-compact-list">
          ${envVars.length ? envVars.map((v) => renderCompactVariableRow(v, "env")).join("") : `<p class="env-popover-empty">${labels.emptyEnvVars}</p>`}
        </div>
      </div>
    `
    : "";

  const body = `
    <div class="env-popover-section">
      <span class="env-popover-label">${labels.activeEnvironment}</span>
      <div class="env-pill-row">${pills}</div>
    </div>
    ${varsSection}
  `;

  const footer = `<button class="quiet-button" type="button" data-env-manage-open>${labels.manage}</button>`;

  return renderPopoverShell({
    className: "env-popover",
    title: environmentChipLabel(),
    ariaLabel: labels.popoverTitle,
    bodyHtml: body,
    footerHtml: footer
  });
}

function buildVariablesPopoverHtml(): string {
  const labels = t().variables;
  const globals = state.variables;
  const active = globals.filter((v) => v.enabled && v.name.trim()).length;

  const list =
    globals.length > 0
      ? `<div class="env-compact-list">${globals.map((v) => renderCompactVariableRow(v, "global")).join("")}</div>`
      : `<p class="env-popover-empty">${labels.emptyTitle}</p>`;

  const body = `
    <p class="vars-popover-meta">${labels.popoverMeta.replace("{total}", String(globals.length)).replace("{active}", String(active))}</p>
    ${list}
  `;

  const footer = `<button class="quiet-button" type="button" data-vars-manage-open>${labels.popoverManage}</button>`;

  return renderPopoverShell({
    className: "vars-popover",
    title: labels.title,
    ariaLabel: labels.popoverTitle,
    bodyHtml: body,
    footerHtml: footer
  });
}

function bindEnvironmentPopover(popover: HTMLElement, onVariablesChanged?: VariableChangeHandler) {
  popover.querySelectorAll<HTMLButtonElement>("[data-env-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeEnvironmentId = button.dataset.envPick || null;
      scheduleSave();
      onVariablesChanged?.();
      syncRequestPopover();
    });
  });

  popover.querySelector("[data-env-manage-open]")?.addEventListener("click", () => {
    closeRequestPopovers();
    openVariablesPanelHook?.("environments");
  });

  const env = getActiveEnvironment();
  if (!env) return;

  popover.querySelector("[data-env-popover-add]")?.addEventListener("click", () => {
    env.variables.push({ id: id(), name: "", value: "", enabled: true });
    scheduleSave();
    onVariablesChanged?.();
    syncRequestPopover();
  });

  bindCompactVariableList(popover, env.variables, () => {
    scheduleSave();
    onVariablesChanged?.();
  }, "env");
}

function bindVariablesPopover(popover: HTMLElement, onVariablesChanged?: VariableChangeHandler) {
  popover.querySelector("[data-vars-manage-open]")?.addEventListener("click", () => {
    closeRequestPopovers();
    openVariablesPanelHook?.("globals");
  });

  bindCompactVariableList(popover, state.variables, () => {
    scheduleSave();
    onVariablesChanged?.();
  }, "global");
}

function renderCompactVariableRow(variable: Variable, scope: string): string {
  const labels = t().variables;
  const disabledClass = variable.enabled ? "" : " is-disabled";
  const secretClass = variable.secret ? " is-secret" : "";
  return `
    <div class="env-compact-row${disabledClass}${secretClass}" data-variable-id="${variable.id}" data-var-scope="${scope}">
      <label class="variable-toggle" title="${labels.colEnabled}">
        <input class="variable-enabled" type="checkbox" ${variable.enabled ? "checked" : ""} />
        <span class="variable-toggle-ui" aria-hidden="true"></span>
      </label>
      ${renderVariableSecretButton(variable)}
      <input class="variable-name" value="${escapeAttribute(variable.name)}" placeholder="${labels.namePlaceholder}" spellcheck="false" autocomplete="off" />
      ${renderVariableValueInput(variable, labels.valuePlaceholder)}
      <button class="mini-btn variable-remove" type="button" aria-label="${t().tree.delete}">${iconRemove}</button>
    </div>
  `;
}

function bindCompactVariableList(
  root: ParentNode,
  variables: Variable[],
  onChange: VariableChangeHandler,
  scope: string
) {
  root.querySelectorAll<HTMLElement>(`.env-compact-row[data-var-scope="${scope}"]`).forEach((row) => {
    const variable = variables.find((item) => item.id === row.dataset.variableId);
    if (!variable) return;

    row.querySelector<HTMLInputElement>(".variable-enabled")?.addEventListener("change", (event) => {
      variable.enabled = (event.target as HTMLInputElement).checked;
      row.classList.toggle("is-disabled", !variable.enabled);
      onChange();
    });

    row.querySelector<HTMLInputElement>(".variable-name")?.addEventListener("input", (event) => {
      variable.name = (event.target as HTMLInputElement).value;
      onChange();
    });

    row.querySelector<HTMLInputElement>(".variable-value")?.addEventListener("input", (event) => {
      variable.value = (event.target as HTMLInputElement).value;
      onChange();
    });

    bindVariableSecretToggle(row, variable, onChange);
    syncVariableRowSecretUi(row, variable);

    row.querySelector(".variable-remove")?.addEventListener("click", () => {
      const index = variables.findIndex((item) => item.id === variable.id);
      if (index >= 0) variables.splice(index, 1);
      row.remove();
      if (!variables.length) {
        const list = root.querySelector(".env-compact-list");
        if (list) list.innerHTML = `<p class="env-popover-empty">${t().variables.emptyTitle}</p>`;
      }
      onChange();
    });
  });
}

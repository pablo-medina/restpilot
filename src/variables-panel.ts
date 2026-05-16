import { iconRemove } from "./icons";
import { t } from "./i18n";
import { escapeAttribute, escapeHtml } from "./content-display";
import type { Variable } from "./types";

function formatVariablesStats(total: number, active: number) {
  return t().variables.stats.replace("{total}", String(total)).replace("{active}", String(active));
}

function renderVariableToken(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return `<span class="variable-token variable-token-empty">—</span>`;
  return `<code class="variable-token">${escapeHtml(`\${${trimmed}}`)}</code>`;
}

function renderVariableItem(variable: Variable) {
  const labels = t().variables;
  const disabledClass = variable.enabled ? "" : " is-disabled";
  return `
    <div class="variable-item${disabledClass}" data-variable-id="${variable.id}">
      <label class="variable-toggle" title="${labels.colEnabled}">
        <input class="variable-enabled" type="checkbox" ${variable.enabled ? "checked" : ""} />
        <span class="variable-toggle-ui" aria-hidden="true"></span>
      </label>
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
        <input class="variable-value" value="${escapeAttribute(variable.value)}" placeholder="${labels.valuePlaceholder}" spellcheck="false" autocomplete="off" />
      </div>
      <button class="mini-btn variable-remove remove-variable" type="button" aria-label="${t().tree.delete}">${iconRemove}</button>
    </div>
  `;
}

export function renderVariablesPanel(variables: Variable[]) {
  const labels = t().variables;
  const total = variables.length;
  const active = variables.filter((item) => item.enabled).length;

  const listMarkup = total
    ? `
      <div class="variables-table-head" aria-hidden="true">
        <span>${labels.colEnabled}</span>
        <span>${labels.colName}</span>
        <span>${labels.tokenPreview}</span>
        <span>${labels.colValue}</span>
        <span></span>
      </div>
      <div class="variables-list">
        ${variables.map((variable) => renderVariableItem(variable)).join("")}
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
    <section class="variables-view">
      <header class="variables-header">
        <button class="settings-back" id="panel-back" type="button" aria-label="${t().nav.backToWorkspace}">
          <span class="settings-back-icon" aria-hidden="true">←</span>
          ${t().nav.backToWorkspace}
        </button>
        <div class="variables-heading">
          <h1>${labels.title}</h1>
          <p>${labels.description}</p>
        </div>
        ${total ? `<button class="variables-add-btn" id="add-variable" type="button"><span class="variables-add-icon" aria-hidden="true">+</span>${labels.add}</button>` : ""}
      </header>

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
        </div>
        ${listMarkup}
      </article>
    </section>
  `;
}

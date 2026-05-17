import { escapeAttribute } from "./content-display";
import { iconKey } from "./icons";
import { t } from "./i18n";
import type { Variable } from "./types";

export function renderVariableSecretButton(variable: Variable) {
  const labels = t().variables;
  const active = variable.secret ? " is-active" : "";
  return `
    <button
      class="mini-btn variable-secret-btn${active}"
      type="button"
      title="${labels.secretToggle}"
      aria-label="${labels.secretToggle}"
      aria-pressed="${variable.secret ? "true" : "false"}"
    >${iconKey}</button>
  `;
}

export function variableValueInputAttributes(variable: Variable) {
  return variable.secret
    ? 'type="password" autocomplete="off"'
    : 'type="text" autocomplete="off"';
}

export function renderVariableValueInput(variable: Variable, placeholder: string) {
  return `<input class="variable-value" ${variableValueInputAttributes(variable)} value="${escapeAttribute(variable.value)}" placeholder="${placeholder}" spellcheck="false" />`;
}

export function syncVariableRowSecretUi(row: HTMLElement, variable: Variable) {
  row.classList.toggle("is-secret", Boolean(variable.secret));
  const button = row.querySelector<HTMLButtonElement>(".variable-secret-btn");
  if (button) {
    button.classList.toggle("is-active", Boolean(variable.secret));
    button.setAttribute("aria-pressed", variable.secret ? "true" : "false");
  }
  const valueInput = row.querySelector<HTMLInputElement>(".variable-value");
  if (valueInput) {
    valueInput.type = variable.secret ? "password" : "text";
  }
}

export function bindVariableSecretToggle(
  row: HTMLElement,
  variable: Variable,
  onChange: () => void
) {
  row.querySelector<HTMLButtonElement>(".variable-secret-btn")?.addEventListener("click", () => {
    variable.secret = !variable.secret;
    syncVariableRowSecretUi(row, variable);
    onChange();
  });
}

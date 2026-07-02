import { messageDialog } from "../components/dialogs";
import { t } from "../i18n";
import { effectiveVariables } from "../lib/variables";
import type { Environment } from "../types";
import { scheduleSave } from "./persistence";
import { state } from "./state";

export { effectiveVariables };

export function getActiveEnvironment(): Environment | null {
  if (!state.activeEnvironmentId) return null;
  return state.environments.find((env) => env.id === state.activeEnvironmentId) ?? null;
}

export function activeEnvironmentVariables() {
  return getActiveEnvironment()?.variables ?? [];
}

export function getEffectiveVariables() {
  return effectiveVariables(state.variables, activeEnvironmentVariables());
}

export function environmentChipLabel(): string {
  const labels = t().environments;
  const env = getActiveEnvironment();
  if (!env) return labels.noEnvironment;
  const count = env.variables.filter((item) => item.enabled && item.name.trim()).length;
  return count > 0 ? `${env.name} · ${count}` : env.name;
}

export function commitEnvironmentRename(envId: string, newName: string, onVariablesChanged?: () => void) {
  const trimmed = newName.trim();
  const labels = t().environments;
  const duplicate = state.environments.find(
    (item) => item.id !== envId && item.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    void messageDialog(
      "warning",
      labels.duplicateWarningTitle || "Duplicate environment name",
      labels.duplicateWarningBody?.replace("{name}", trimmed) ||
        `An environment named "${trimmed}" already exists. Please choose a unique name.`
    );
    state.editingEnvId = null;
    onVariablesChanged?.();
    return;
  }

  const env = state.environments.find((item) => item.id === envId);
  if (env) {
    env.name = trimmed;
  }
  state.editingEnvId = null;
  scheduleSave();
  onVariablesChanged?.();
}

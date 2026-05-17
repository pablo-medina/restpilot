import { t } from "../i18n";
import { effectiveVariables } from "../variables";
import type { Environment } from "../types";
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

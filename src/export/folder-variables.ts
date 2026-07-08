import { activeEnvironmentVariables } from "../app/environments";
import { requestAuthTextFields } from "../app/request-auth";
import { state } from "../app/state";
import { effectiveVariables } from "../lib/variables";
import type { SavedRequest, TreeItem, Variable } from "../types";

const VARIABLE_PATTERN = /\$\{([^}]+)\}/g;

export function collectVariableNamesFromText(value: string): Set<string> {
  const names = new Set<string>();
  for (const match of value.matchAll(VARIABLE_PATTERN)) {
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  return names;
}

export function collectVariableNamesFromRequest(request: SavedRequest): Set<string> {
  const names = new Set<string>();
  const fields = [
    request.url,
    request.urlHash ?? "",
    request.body,
    request.graphqlVariables ?? "",
    ...request.queryParams.flatMap((pair) => [pair.key, pair.value]),
    ...request.headers.flatMap((pair) => [pair.key, pair.value]),
    ...request.form.flatMap((pair) => [pair.key, pair.value]),
    ...requestAuthTextFields(request)
  ];

  for (const field of fields) {
    for (const name of collectVariableNamesFromText(field)) {
      names.add(name);
    }
  }

  return names;
}

export function collectVariableNamesInFolder(items: TreeItem[]): Set<string> {
  const names = new Set<string>();
  for (const item of items) {
    if (item.kind !== "request") continue;
    for (const name of collectVariableNamesFromRequest(item)) {
      names.add(name);
    }
  }
  return names;
}

export function getUsedVariablesInFolder(items: TreeItem[]): Variable[] {
  const names = collectVariableNamesInFolder(items);
  if (!names.size) return [];
  const effective = effectiveVariables(state.variables, activeEnvironmentVariables());
  return effective.filter((variable) => names.has(variable.name.trim()));
}

export type HtmlExportVariableSelection = {
  name: string;
  include: boolean;
};

export type HtmlExportVariable = {
  name: string;
  value: string;
};

export function applyHtmlExportVariableSelection(
  used: Variable[],
  selection: HtmlExportVariableSelection[]
): HtmlExportVariable[] {
  const byName = new Map(used.map((variable) => [variable.name.trim(), variable]));
  const exported: HtmlExportVariable[] = [];

  for (const entry of selection) {
    if (!entry.include) continue;
    const variable = byName.get(entry.name.trim());
    if (!variable) continue;
    exported.push({ name: variable.name, value: variable.value });
  }

  return exported;
}

export function defaultHtmlExportSelection(used: Variable[]): HtmlExportVariableSelection[] {
  return used.map((variable) => ({
    name: variable.name.trim(),
    include: !variable.secret
  }));
}

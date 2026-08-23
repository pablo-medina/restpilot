import { activeEnvironmentVariables } from "../app/environments";
import { state } from "../app/state";
import { collectTemplateNames, effectiveVariables, requestTemplateFields } from "../lib/variables";
import type { SavedRequest, TreeItem, Variable } from "../types";

export function collectVariableNamesFromText(value: string): Set<string> {
  return collectTemplateNames(value);
}

export function collectVariableNamesFromRequest(request: SavedRequest): Set<string> {
  const names = new Set<string>();
  for (const field of requestTemplateFields(request)) {
    for (const name of collectVariableNamesFromText(field)) {
      names.add(name);
    }
  }
  return names;
}

function collectVariableNamesInFolder(items: TreeItem[]): Set<string> {
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

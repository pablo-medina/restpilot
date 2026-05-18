import type { CollectionSnapshot, Environment, TreeItem, UserSettings, Variable } from "../types";
import { normalizeConfig } from "./config-normalize";
import { COLLECTION_ROOT_PARENT_ID, isCollectionRoot, normalizeParentId } from "./collection-parent";

function newId() {
  return crypto.randomUUID();
}

export const COLLECTION_FORMAT = "restpilot-collection" as const;
export const COLLECTION_VERSION = 1;

export type CollectionExportFile = {
  format: typeof COLLECTION_FORMAT;
  version: typeof COLLECTION_VERSION;
  exportedAt: string;
  collection: CollectionSnapshot;
};

export type ImportMode = "replace" | "merge";
export type ImportConflictPolicy = "rename" | "skip";

function stripVariableValues(variables: Variable[], secretsOnly = false): Variable[] {
  return variables.map((variable) => ({
    ...variable,
    value: secretsOnly ? (variable.secret ? "" : variable.value) : ""
  }));
}

export function sanitizeItemsForExport(items: TreeItem[]): TreeItem[] {
  return items.map((item) => {
    if (item.kind !== "request") return item;
    return {
      ...item,
      lastResponse: null,
      lastError: null,
      form: item.form.map((field) => (field.partType === "file" ? { ...field, value: "" } : field))
    };
  });
}

export function buildCollectionSnapshot(snapshot: CollectionSnapshot, excludeValues: boolean): CollectionSnapshot {
  return {
    items: sanitizeItemsForExport(snapshot.items),
    variables: excludeValues
      ? stripVariableValues(snapshot.variables)
      : stripVariableValues(snapshot.variables, true),
    environments: excludeValues
      ? snapshot.environments.map((env) => ({ ...env, variables: stripVariableValues(env.variables) }))
      : snapshot.environments.map((env) => ({
          ...env,
          variables: stripVariableValues(env.variables, true)
        })),
    activeEnvironmentId: snapshot.activeEnvironmentId
  };
}

export function parseCollectionExport(raw: string, settings: UserSettings): CollectionExportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("invalid-json");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("invalid-format");
  const file = parsed as Partial<CollectionExportFile>;
  if (file.format !== COLLECTION_FORMAT) throw new Error("invalid-format");
  if (file.version !== COLLECTION_VERSION) throw new Error("unsupported-version");

  const collection = file.collection;
  if (!collection || typeof collection !== "object") throw new Error("invalid-format");

  const normalized = normalizeConfig({
    items: (collection as CollectionSnapshot).items ?? [],
    variables: (collection as CollectionSnapshot).variables ?? [],
    environments: (collection as CollectionSnapshot).environments ?? [],
    activeEnvironmentId: (collection as CollectionSnapshot).activeEnvironmentId ?? null,
    openTabs: [],
    activeTabId: "",
    settings,
    functions: [],
    activeFunctionId: null
  });

  return {
    format: COLLECTION_FORMAT,
    version: COLLECTION_VERSION,
    exportedAt: typeof file.exportedAt === "string" ? file.exportedAt : new Date().toISOString(),
    collection: {
      items: normalized.items,
      variables: normalized.variables,
      environments: normalized.environments,
      activeEnvironmentId: normalized.activeEnvironmentId
    }
  };
}

function uniquifyTitle(title: string, used: Set<string>) {
  let candidate = title;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${title} (${index})`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function collectSkipIds(items: TreeItem[], existingIds: Set<string>): Set<string> {
  const skip = new Set<string>();
  for (const item of items) {
    if (existingIds.has(item.id)) skip.add(item.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (
        !isCollectionRoot(item.parentId) &&
        skip.has(item.parentId) &&
        !skip.has(item.id)
      ) {
        skip.add(item.id);
        changed = true;
      }
    }
  }
  return skip;
}

export function mergeItems(existing: TreeItem[], incoming: TreeItem[], conflict: ImportConflictPolicy): TreeItem[] {
  if (conflict === "rename") {
    const existingIds = new Set(existing.map((item) => item.id));
    const usedTitles = new Set(existing.map((item) => item.title));
    const idMap = new Map<string, string>();

    for (const item of incoming) {
      if (existingIds.has(item.id)) idMap.set(item.id, newId());
      else idMap.set(item.id, item.id);
    }

    const merged = [...existing];
    for (const item of incoming) {
      const nextId = idMap.get(item.id);
      if (!nextId) continue;
      const parentId = isCollectionRoot(item.parentId)
        ? COLLECTION_ROOT_PARENT_ID
        : (idMap.get(item.parentId) ?? item.parentId);
      const title = nextId === item.id ? item.title : uniquifyTitle(item.title, usedTitles);
      merged.push({ ...item, id: nextId, parentId, title });
      existingIds.add(nextId);
    }
    return merged;
  }

  const existingIds = new Set(existing.map((item) => item.id));
  const skip = collectSkipIds(incoming, existingIds);

  const merged = [...existing];
  for (const item of incoming) {
    if (skip.has(item.id)) continue;
    const parentId = isCollectionRoot(item.parentId)
      ? COLLECTION_ROOT_PARENT_ID
      : skip.has(item.parentId)
        ? COLLECTION_ROOT_PARENT_ID
        : normalizeParentId(item.parentId);
    merged.push({ ...item, parentId });
    existingIds.add(item.id);
  }
  return merged;
}

export function mergeVariables(
  existing: Variable[],
  incoming: Variable[],
  conflict: ImportConflictPolicy
): Variable[] {
  const byId = new Map(existing.map((variable) => [variable.id, variable]));
  for (const variable of incoming) {
    if (byId.has(variable.id)) {
      if (conflict === "skip") continue;
      const renamed = { ...variable, id: newId(), name: uniquifyTitle(variable.name, new Set([...byId.values()].map((v) => v.name))) };
      byId.set(renamed.id, renamed);
      continue;
    }
    byId.set(variable.id, variable);
  }
  return [...byId.values()];
}

export function mergeEnvironments(
  existing: Environment[],
  incoming: Environment[],
  conflict: ImportConflictPolicy
): Environment[] {
  const byId = new Map(existing.map((env) => [env.id, env]));
  for (const environment of incoming) {
    if (byId.has(environment.id)) {
      if (conflict === "skip") continue;
      const renamed = {
        ...environment,
        id: newId(),
        name: uniquifyTitle(environment.name, new Set([...byId.values()].map((env) => env.name)))
      };
      byId.set(renamed.id, renamed);
      continue;
    }
    byId.set(environment.id, environment);
  }
  return [...byId.values()];
}

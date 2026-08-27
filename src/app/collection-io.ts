import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { applicationDialog, messageDialog, type DialogOutcome } from "../components/dialogs";
import { t } from "../i18n";
import { isSeedConfig } from "./config-normalize";
import {
  buildCollectionSnapshot,
  mergeEnvironments,
  mergeItems,
  mergeVariables,
  parseCollectionExport,
  type ImportConflictPolicy,
  type ImportMode
} from "./collection-format";
import type { CollectionSnapshot } from "../types";
import { render } from "./render";
import { scheduleSave } from "./persistence";
import { state } from "./state";

export {
  COLLECTION_FORMAT,
  COLLECTION_VERSION,
  buildCollectionSnapshot,
  mergeItems,
  mergeVariables,
  parseCollectionExport
} from "./collection-format";

function dialogAction(result: string | DialogOutcome): string {
  return typeof result === "string" ? result : result.action;
}

function dialogData(result: string | DialogOutcome): Record<string, unknown> | undefined {
  return typeof result === "object" && result !== null && "data" in result ? result.data : undefined;
}

function buildCollectionExport(excludeValues: boolean) {
  const collection = buildCollectionSnapshot(
    {
      items: state.items,
      variables: state.variables,
      environments: state.environments,
      activeEnvironmentId: state.activeEnvironmentId
    },
    excludeValues
  );

  return {
    format: "restpilot-collection" as const,
    version: 1,
    exportedAt: new Date().toISOString(),
    collection
  };
}

function applyCollectionSnapshot(
  snapshot: CollectionSnapshot,
  mode: ImportMode,
  conflict: ImportConflictPolicy
) {
  if (mode === "replace") {
    state.items = snapshot.items;
    state.variables = snapshot.variables;
    state.environments = snapshot.environments;
    state.activeEnvironmentId = snapshot.activeEnvironmentId;
  } else {
    state.items = mergeItems(state.items, snapshot.items, conflict);
    state.variables = mergeVariables(state.variables, snapshot.variables, conflict);
    state.environments = mergeEnvironments(state.environments, snapshot.environments, conflict);
    if (
      snapshot.activeEnvironmentId &&
      state.environments.some((env) => env.id === snapshot.activeEnvironmentId)
    ) {
      state.activeEnvironmentId = snapshot.activeEnvironmentId;
    }
  }

  const validIds = new Set(state.items.filter((item) => item.kind === "request").map((item) => item.id));
  state.openTabs = state.openTabs.filter((tabId) => validIds.has(tabId));
  if (state.activeTabId && !validIds.has(state.activeTabId)) {
    state.activeTabId = state.openTabs[0] ?? "";
  }
  for (const tabId of Object.keys(state.tabs)) {
    if (!validIds.has(tabId)) delete state.tabs[tabId];
  }
  if (state.selectedTreeId && !state.items.some((item) => item.id === state.selectedTreeId)) {
    state.selectedTreeId = null;
  }
  if (state.envManageSelectedId && !state.environments.some((env) => env.id === state.envManageSelectedId)) {
    state.envManageSelectedId = state.activeEnvironmentId;
  }
}

function renderExportOptionsHtml() {
  const labels = t().collection;
  return `
    <div class="dialog-form">
      <label class="dialog-form-toggle">
        <input type="checkbox" data-collection-export-exclude-values />
        <span>${labels.exportExcludeValues}</span>
      </label>
      <p class="dialog-form-hint">${labels.exportExcludeValuesHint}</p>
    </div>
  `;
}

function renderImportOptionsHtml(snapshot: CollectionSnapshot) {
  const labels = t().collection;
  const requestCount = snapshot.items.filter((item) => item.kind === "request").length;
  const folderCount = snapshot.items.filter((item) => item.kind === "folder").length;
  const summary = labels.importSummary
    .replace("{requests}", String(requestCount))
    .replace("{folders}", String(folderCount))
    .replace("{variables}", String(snapshot.variables.length))
    .replace("{environments}", String(snapshot.environments.length));

  return `
    <div class="dialog-form">
      <p class="dialog-form-lead">${summary}</p>
      <fieldset class="dialog-form-fieldset">
        <legend>${labels.importModeLegend}</legend>
        <div class="dialog-form-options">
          <label class="dialog-form-option">
            <input type="radio" name="collection-import-mode" value="merge" checked />
            <span>
              <strong>${labels.importModeMerge}</strong>
              <small>${labels.importModeMergeHint}</small>
            </span>
          </label>
          <label class="dialog-form-option">
            <input type="radio" name="collection-import-mode" value="replace" />
            <span>
              <strong>${labels.importModeReplace}</strong>
              <small>${labels.importModeReplaceHint}</small>
            </span>
          </label>
        </div>
      </fieldset>
      <fieldset class="dialog-form-fieldset" data-collection-import-conflicts>
        <legend>${labels.importConflictLegend}</legend>
        <div class="dialog-form-options">
          <label class="dialog-form-option">
            <input type="radio" name="collection-import-conflict" value="rename" checked />
            <span>
              <strong>${labels.importConflictRename}</strong>
              <small>${labels.importConflictRenameHint}</small>
            </span>
          </label>
          <label class="dialog-form-option">
            <input type="radio" name="collection-import-conflict" value="skip" />
            <span>
              <strong>${labels.importConflictSkip}</strong>
              <small>${labels.importConflictSkipHint}</small>
            </span>
          </label>
        </div>
      </fieldset>
    </div>
  `;
}

function readImportOptions(result: string | DialogOutcome): { mode: ImportMode; conflict: ImportConflictPolicy } {
  const data = dialogData(result);
  const mode = data?.importMode === "replace" ? "replace" : "merge";
  const conflict = data?.conflictPolicy === "skip" ? "skip" : "rename";
  return { mode, conflict };
}

export async function exportCollection() {
  const labels = t().collection;
  const result = await applicationDialog({
    title: labels.exportTitle,
    body: labels.exportBody,
    mode: "collection-export",
    resizable: false,
    width: 440,
    height: 0,
    previewHtml: renderExportOptionsHtml(),
    actions: [
      { id: "cancel", label: t().dialog.cancel },
      { id: "export", label: labels.exportAction, role: "primary" }
    ]
  });

  const action = dialogAction(result);
  if (action !== "export") return;

  const excludeValues = Boolean(dialogData(result)?.excludeValues);
  const path = await save({
    title: labels.exportTitle,
    filters: [{ name: labels.fileFilter, extensions: ["json"] }],
    defaultPath: "restpilot-collection.json"
  });
  if (!path) return;

  try {
    const payload = buildCollectionExport(excludeValues);
    await writeTextFile(path, JSON.stringify(payload, null, 2));
    await messageDialog("information", labels.exportDoneTitle, labels.exportDoneBody);
  } catch {
    await messageDialog("error", labels.exportFailedTitle, labels.exportFailedBody);
  }
}

export async function importCollection() {
  const labels = t().collection;
  const path = await open({
    title: labels.importTitle,
    filters: [{ name: labels.fileFilter, extensions: ["json"] }],
    multiple: false
  });
  if (!path || Array.isArray(path)) return;

  let snapshot: CollectionSnapshot;
  try {
    const raw = await readTextFile(path);
    snapshot = parseCollectionExport(raw, state.settings).collection;
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "unsupported-version") {
      await messageDialog("error", labels.importFailedTitle, labels.importUnsupportedVersion);
      return;
    }
    await messageDialog("error", labels.importFailedTitle, labels.importInvalidFile);
    return;
  }

  const hasContent =
    !isSeedConfig({
      configVersion: state.configVersion,
      items: state.items,
      variables: state.variables,
      environments: state.environments,
      activeEnvironmentId: state.activeEnvironmentId,
      openTabs: state.openTabs,
      activeTabId: state.activeTabId,
      settings: state.settings,
      helpers: state.helpers
    }) &&
    (state.items.length > 0 || state.variables.length > 0 || state.environments.length > 0);

  if (hasContent) {
    const result = await applicationDialog({
      title: labels.importTitle,
      body: labels.importBody,
      mode: "collection-import",
      resizable: false,
      width: 480,
      height: 0,
      previewHtml: renderImportOptionsHtml(snapshot),
      actions: [
        { id: "cancel", label: t().dialog.cancel },
        { id: "import", label: labels.importAction, role: "primary" }
      ]
    });

    const action = dialogAction(result);
    if (action !== "import") return;

    const { mode, conflict } = readImportOptions(result);
    if (mode === "replace") {
      const confirm = await messageDialog(
        "confirmation",
        labels.importReplaceConfirmTitle,
        labels.importReplaceConfirmBody
      );
      if (confirm !== "confirm") return;
    }
    applyCollectionSnapshot(snapshot, mode, conflict);
  } else {
    applyCollectionSnapshot(snapshot, "replace", "rename");
  }

  scheduleSave();
  render();
  await messageDialog("information", labels.importDoneTitle, labels.importDoneBody);
}

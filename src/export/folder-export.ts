import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { applicationDialog, messageDialog, type DialogOutcome } from "../components/dialogs";
import { escapeHtml } from "../lib/content-display";
import { t } from "../i18n";
import type { Variable } from "../types";
import { COLLECTION_FORMAT, COLLECTION_VERSION } from "../app/collection-format";
import {
  buildFolderExportSnapshot,
  folderExportDefaultName,
  sanitizedFolderCollectionSnapshot
} from "./folder-snapshot";
import {
  applyHtmlExportVariableSelection,
  defaultHtmlExportSelection,
  getUsedVariablesInFolder,
  type HtmlExportVariable,
  type HtmlExportVariableSelection
} from "./folder-variables";
import { buildPostmanCollectionExport } from "./postman-export";
import { buildFolderHtmlBundle } from "./html-bundle";

function dialogAction(result: string | DialogOutcome): string {
  return typeof result === "string" ? result : result.action;
}

function dialogData(result: string | DialogOutcome): Record<string, unknown> | undefined {
  return typeof result === "object" && result !== null && "data" in result ? result.data : undefined;
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

function renderHtmlExportOptionsHtml(used: Variable[]) {
  const labels = t().tree;
  const rows = used
    .map((variable) => {
      const name = variable.name.trim();
      const checked = variable.secret ? "" : " checked";
      return `
        <label class="dialog-form-option dialog-html-export-var" data-html-export-var data-var-name="${escapeHtml(name)}">
          <input type="checkbox" data-export-var${checked} />
          <span><strong>${escapeHtml(name)}</strong></span>
        </label>
      `;
    })
    .join("");

  return `
    <div class="dialog-form">
      <fieldset class="dialog-form-fieldset">
        <legend>${labels.exportHtmlVariables}</legend>
        <div class="dialog-form-options">${rows}</div>
      </fieldset>
    </div>
  `;
}

function readHtmlExportSelection(data: Record<string, unknown> | undefined): HtmlExportVariableSelection[] {
  const rows = data?.exportVariables;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const entry = row as Record<string, unknown>;
      const name = String(entry.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        include: Boolean(entry.include)
      };
    })
    .filter((entry): entry is HtmlExportVariableSelection => entry !== null);
}

async function saveTextFile(
  title: string,
  defaultPath: string,
  filters: Array<{ name: string; extensions: string[] }>,
  content: string
): Promise<boolean> {
  const labels = t().collection;
  const path = await save({ title, filters, defaultPath });
  if (!path) return false;
  try {
    await writeTextFile(path, content);
    await messageDialog("information", labels.exportDoneTitle, labels.exportDoneBody);
    return true;
  } catch {
    await messageDialog("error", labels.exportFailedTitle, labels.exportFailedBody);
    return false;
  }
}

export async function exportFolderAsRestpilot(folderId: string): Promise<void> {
  const snapshot = buildFolderExportSnapshot(folderId);
  if (!snapshot) return;

  const labels = t().collection;
  const treeLabels = t().tree;
  const result = await applicationDialog({
    title: treeLabels.exportFolderRestpilot,
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

  if (dialogAction(result) !== "export") return;

  const excludeValues = Boolean(dialogData(result)?.excludeValues);
  const collection = sanitizedFolderCollectionSnapshot(snapshot, excludeValues);
  const payload = {
    format: COLLECTION_FORMAT,
    version: COLLECTION_VERSION,
    exportedAt: new Date().toISOString(),
    collection
  };
  const baseName = folderExportDefaultName({ id: snapshot.folderId, kind: "folder", parentId: "/", title: snapshot.folderName, expanded: false });
  await saveTextFile(
    treeLabels.exportFolderRestpilot,
    `${baseName}.restpilot.json`,
    [{ name: labels.fileFilter, extensions: ["json"] }],
    JSON.stringify(payload, null, 2)
  );
}

export async function exportFolderAsPostman(folderId: string): Promise<void> {
  const snapshot = buildFolderExportSnapshot(folderId);
  if (!snapshot) return;

  const labels = t().tree;
  const collectionLabels = t().collection;
  const baseName = folderExportDefaultName({ id: snapshot.folderId, kind: "folder", parentId: "/", title: snapshot.folderName, expanded: false });
  const payload = buildPostmanCollectionExport(snapshot);
  await saveTextFile(
    labels.exportFolderPostman,
    `${baseName}.postman_collection.json`,
    [{ name: collectionLabels.importSourcePostman, extensions: ["json"] }],
    JSON.stringify(payload, null, 2)
  );
}

async function pickHtmlExportVariables(used: Variable[]): Promise<HtmlExportVariable[] | null> {
  if (!used.length) return [];

  const treeLabels = t().tree;
  const result = await applicationDialog({
    title: treeLabels.exportFolderHtmlTitle,
    body: "",
    mode: "html-export",
    resizable: false,
    width: 420,
    height: 0,
    previewHtml: renderHtmlExportOptionsHtml(used),
    actions: [
      { id: "cancel", label: t().dialog.cancel },
      { id: "export", label: t().collection.exportAction, role: "primary" }
    ]
  });

  if (dialogAction(result) !== "export") return null;
  const selection = readHtmlExportSelection(dialogData(result));
  const effectiveSelection = selection.length ? selection : defaultHtmlExportSelection(used);
  return applyHtmlExportVariableSelection(used, effectiveSelection);
}

export async function exportFolderAsHtml(folderId: string): Promise<void> {
  const snapshot = buildFolderExportSnapshot(folderId);
  if (!snapshot) return;

  const used = getUsedVariablesInFolder(snapshot.items);
  const variables = await pickHtmlExportVariables(used);
  if (variables === null) return;

  const labels = t().tree;
  const baseName = folderExportDefaultName({ id: snapshot.folderId, kind: "folder", parentId: "/", title: snapshot.folderName, expanded: false });
  const html = buildFolderHtmlBundle(snapshot, variables);
  await saveTextFile(
    labels.exportFolderHtml,
    `${baseName}.html`,
    [{ name: labels.exportFolderHtmlFilter, extensions: ["html"] }],
    html
  );
}

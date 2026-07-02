import { applicationDialog, messageDialog } from "../components/dialogs";
import { t } from "../i18n";
import { parseCurl } from "../lib/curl";
import { blankRequest } from "../app/request-utils";
import { parseCollectionExport } from "../app/collection-format";
import { defaultSettings } from "../types";
import type { Folder, SavedRequest, TreeItem } from "../types";
import type { ImportParseResult, ImportSource, ImportTreeNode } from "./types";
import { parsePostmanCollection } from "./postman";
import { parseOpenApiSpec } from "./openapi";

async function showSourceSelection(): Promise<{ source: ImportSource; filePath?: string; curlText?: string } | null> {
  const labels = t().collection;

  const html = `
    <fieldset class="import-src-fieldset">
      <label>
        <input type="radio" name="import-source" value="restpilot" checked />
        ${labels.importSourceRestpilot}
      </label>
      <p class="import-src-desc">${labels.importSourceRestpilotDesc}</p>
      <label>
        <input type="radio" name="import-source" value="postman" />
        ${labels.importSourcePostman}
      </label>
      <p class="import-src-desc">${labels.importSourcePostmanDesc}</p>
      <label>
        <input type="radio" name="import-source" value="openapi" />
        ${labels.importSourceOpenapi}
      </label>
      <p class="import-src-desc">${labels.importSourceOpenapiDesc}</p>
      <label>
        <input type="radio" name="import-source" value="curl" />
        ${labels.importSourceCurl}
      </label>
      <p class="import-src-desc">${labels.importSourceCurlDesc}</p>
    </fieldset>
    <div class="import-curl-area hidden" id="import-curl-area">
      <textarea data-import-curl-text placeholder="${labels.importCurlPlaceholder}"></textarea>
    </div>`;

  const result = await applicationDialog({
    title: labels.importSourceTitle,
    body: labels.importSourceBody,
    mode: "import-source",
    previewHtml: html,
    width: 520,
    height: 0,
    resizable: false
  });

  if (typeof result === "string" && result !== "import") return null;
  if (typeof result === "object" && result.action !== "import") return null;

  const data = typeof result === "object" ? result.data : undefined;
  const source = (data?.source as ImportSource) ?? "restpilot";
  const curlText = data?.curlText as string | undefined;

  return { source, curlText };
}

function flattenTreeForCheckbox(nodes: ImportTreeNode[], depth: number = 0): string {
  let html = "";
  for (const node of nodes) {
    const indent = depth > 0 ? `<span class="import-item-indent"></span>`.repeat(depth) : "";
    const icon = node.kind === "folder" ? "📁" : "📄";
    const methodBadge =
      node.kind === "request" && node.method
        ? `<span class="import-item-method" style="color:var(--http-method-${node.method.toLowerCase()},inherit)">${node.method}</span>`
        : "";
    const urlLabel = node.url ? `<span class="import-item-url">${node.url}</span>` : "";

    html += `<div class="import-tree-item">
      <input type="checkbox" data-import-item-id="${node.id}" value="${node.id}" checked />
      ${indent}<span class="import-item-icon">${icon}</span>
      ${methodBadge}
      <span class="import-item-title">${node.title}</span>
      ${urlLabel}
    </div>`;

    if (node.children) {
      html += flattenTreeForCheckbox(node.children, depth + 1);
    }
  }
  return html;
}

function buildFolderOptions(folders: Folder[]): string {
  const labels = t().collection;
  let html = `<option value="/">${labels.importPreviewTargetRoot}</option>`;
  for (const folder of folders) {
    html += `<option value="${folder.id}">${folder.title}</option>`;
  }
  return html;
}

async function showPreviewDialog(
  result: ImportParseResult,
  existingFolders: Folder[]
): Promise<{ selectedIds: string[]; targetFolderId: string } | null> {
  const labels = t().collection;
  const totalRequests = result.requests.length;
  const totalFolders = result.folders.length;

  const summary = labels.importPreviewBody
    .replace("{name}", result.name)
    .replace("{requests}", String(totalRequests))
    .replace("{folders}", String(totalFolders));

  const treeHtml = flattenTreeForCheckbox(result.tree);
  const folderSelect = buildFolderOptions(existingFolders);

  const previewHtml = `
    <div class="import-preview-summary">${summary}</div>
    <div class="import-select-all">
      <label><input type="checkbox" id="import-select-all" checked /> ${labels.importPreviewSelectAll}</label>
    </div>
    <div class="import-tree-scroll">${treeHtml}</div>
    <div class="import-target-folder">
      <label for="import-target-folder">${labels.importPreviewTargetFolder}</label>
      <select id="import-target-folder" data-import-target-folder>${folderSelect}</select>
    </div>
  `;

  const dialogResult = await applicationDialog({
    title: labels.importPreviewTitle,
    body: "",
    mode: "import-preview",
    previewHtml,
    width: 640,
    height: 480,
    resizable: true,
    actions: [
      { id: "cancel", label: t().dialog.cancel },
      { id: "import", label: t().dialog.import, role: "primary" }
    ]
  });

  if (typeof dialogResult === "string" && dialogResult !== "import") return null;
  if (typeof dialogResult === "object" && dialogResult.action !== "import") return null;

  const data = typeof dialogResult === "object" ? dialogResult.data : undefined;
  const selectedIds = (data?.selectedIds as string[]) ?? [];
  const targetFolderId = (data?.targetFolderId as string) ?? "/";

  if (selectedIds.length === 0) {
    await messageDialog("warning", labels.importPreviewTitle, labels.importPreviewNoItems);
    return null;
  }

  return { selectedIds, targetFolderId };
}

async function pickFile(source: ImportSource): Promise<string | null> {
  let name = "";
  const extensions: string[] = [];

  if (source === "restpilot") {
    name = "RestPilot Collection";
    extensions.push("json");
  } else if (source === "postman") {
    name = "Postman Collection";
    extensions.push("json");
  } else if (source === "openapi") {
    name = "OpenAPI / Swagger";
    extensions.push("json", "yaml", "yml");
  }

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ multiple: false, filters: [{ name, extensions }] });
    return selected ?? null;
  } catch {
    return null;
  }
}

async function readFileContents(filePath: string): Promise<string | null> {
  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    return await readTextFile(filePath);
  } catch (err) {
    await messageDialog(
      "error",
      t().collection.importFailedTitle,
      t().collection.importFileReadError.replace("{error}", String(err))
    );
    return null;
  }
}

function buildTreeFromItems(items: TreeItem[]): ImportTreeNode[] {
  const childrenOf = new Map<string, ImportTreeNode[]>();
  const nodeMap = new Map<string, ImportTreeNode>();

  for (const item of items) {
    if (item.kind === "folder") {
      const node: ImportTreeNode = { id: item.id, title: item.title, kind: "folder", selected: true, children: [] };
      nodeMap.set(item.id, node);
      if (!childrenOf.has(item.parentId)) childrenOf.set(item.parentId, []);
      childrenOf.get(item.parentId)!.push(node);
    }
  }
  for (const item of items) {
    if (item.kind === "request") {
      const node: ImportTreeNode = {
        id: item.id,
        title: item.title,
        kind: "request",
        selected: true,
        method: item.method,
        url: item.url
      };
      nodeMap.set(item.id, node);
      if (!childrenOf.has(item.parentId)) childrenOf.set(item.parentId, []);
      childrenOf.get(item.parentId)!.push(node);
    }
  }

  for (const [parentId, children] of childrenOf) {
    const parent = nodeMap.get(parentId);
    if (parent && parent.kind === "folder") {
      parent.children = children;
    }
  }

  return childrenOf.get("/") ?? [];
}

function parseNativeCollection(json: string): ImportParseResult {
  const parsed = parseCollectionExport(json, defaultSettings());
  const snapshot = parsed.collection;
  const folders = snapshot.items.filter((i): i is Folder => i.kind === "folder");
  const requests = snapshot.items.filter((i): i is SavedRequest => i.kind === "request");
  const tree = buildTreeFromItems(snapshot.items);

  return {
    folders,
    requests,
    tree,
    name: "RestPilot Collection",
    description: undefined
  };
}

function tryParseCurl(text: string): ImportParseResult | { error: string } {
  const parsed = parseCurl(text, () => crypto.randomUUID());
  if (!parsed) return { error: t().messages.importCurlFailed };
  const request = blankRequest();
  request.method = parsed.method;
  request.url = parsed.url;
  request.headers = parsed.headers ?? [];
  request.bodyMode = parsed.bodyMode ?? "none";
  request.rawType = parsed.rawType ?? "text";
  request.body = parsed.body ?? "";
  request.auth = parsed.auth ?? { type: "none" };
  request.queryParams = parsed.queryParams ?? [];
  request.form = parsed.form ?? [];

  return {
    folders: [],
    requests: [request],
    tree: [
      {
        id: request.id,
        title: request.title,
        kind: "request",
        selected: true,
        method: request.method,
        url: request.url
      }
    ],
    name: "cURL Import",
    description: undefined
  };
}

export async function showImportDialog(
  existingFolders: Folder[]
): Promise<ImportParseResult & { selectedIds: string[]; targetFolderId: string } | null> {
  const sourceInfo = await showSourceSelection();
  if (!sourceInfo) return null;

  let rawContent: string | null = null;

  if (sourceInfo.source === "curl") {
    if (!sourceInfo.curlText?.trim()) {
      await messageDialog("warning", t().collection.importFailedTitle, t().collection.importCurlPlaceholder);
      return null;
    }
    rawContent = sourceInfo.curlText;
  } else {
    const filePath = await pickFile(sourceInfo.source);
    if (!filePath) return null;
    rawContent = await readFileContents(filePath);
    if (!rawContent) return null;
  }

  let parseResult: ImportParseResult;
  try {
    if (sourceInfo.source === "restpilot") {
      parseResult = parseNativeCollection(rawContent);
    } else if (sourceInfo.source === "postman") {
      parseResult = parsePostmanCollection(rawContent);
    } else if (sourceInfo.source === "openapi") {
      parseResult = parseOpenApiSpec(rawContent);
    } else if (sourceInfo.source === "curl") {
      const curlResult = tryParseCurl(rawContent);
      if ("error" in curlResult) {
        await messageDialog("error", t().collection.importFailedTitle, curlResult.error);
        return null;
      }
      parseResult = curlResult;
    } else {
      await messageDialog("error", t().collection.importFailedTitle, t().collection.importInvalidFile);
      return null;
    }
  } catch (err) {
    await messageDialog(
      "error",
      t().collection.importFailedTitle,
      t().collection.importParseError.replace("{error}", String(err))
    );
    return null;
  }

  if (parseResult.requests.length === 0 && parseResult.folders.length === 0) {
    await messageDialog("warning", t().collection.importFailedTitle, t().collection.importPreviewNoItems);
    return null;
  }

  const preview = await showPreviewDialog(parseResult, existingFolders);
  if (!preview) return null;

  return { ...parseResult, selectedIds: preview.selectedIds, targetFolderId: preview.targetFolderId };
}

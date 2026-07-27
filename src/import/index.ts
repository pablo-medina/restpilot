import { messageDialog } from "../components/dialogs";
import { t } from "../i18n";
import { insertItemAt } from "../app/collection-store";
import { state } from "../app/state";
import { scheduleSave } from "../app/persistence";
import { render } from "../app/render";
import type { Folder, SavedRequest, TreeItem } from "../types";
import { COLLECTION_ROOT_PARENT_ID } from "../app/collection-parent";
import { showImportDialog, showImportFromTextDialog } from "./source-dialog";
import type { ImportParseResult } from "./types";

function getExistingFolders(): Folder[] {
  return state.items.filter((item: TreeItem) => item.kind === "folder") as Folder[];
}

function applyImport(result: ImportParseResult & { selectedIds: string[]; targetFolderId: string }): void {
  const selectedSet = new Set(result.selectedIds);
  const idMap = new Map<string, string>();
  const targetParentId = result.targetFolderId || COLLECTION_ROOT_PARENT_ID;

  for (const folder of result.folders) {
    if (selectedSet.has(folder.id)) {
      const newId = crypto.randomUUID();
      const newFolder: Folder = { ...folder, id: newId, parentId: targetParentId };
      idMap.set(folder.id, newId);
      insertItemAt(newFolder, newFolder.parentId, -1);
    }
  }

  for (const request of result.requests) {
    if (selectedSet.has(request.id)) {
      const origParentId = request.parentId;
      const remappedParent = idMap.get(origParentId) ?? targetParentId;
      const newRequest: SavedRequest = {
        ...request,
        id: crypto.randomUUID(),
        parentId: remappedParent,
        lastResponse: null,
        lastError: null,
        savedResponses: undefined
      };
      idMap.set(request.id, newRequest.id);
      insertItemAt(newRequest, newRequest.parentId, -1);
    }
  }

  scheduleSave();
  render();
}

async function runImportFlow(
  openDialog: (existingFolders: ReturnType<typeof getExistingFolders>) => ReturnType<typeof showImportDialog>
): Promise<void> {
  const labels = t().collection;

  try {
    const existingFolders = getExistingFolders();
    const result = await openDialog(existingFolders);
    if (!result) return;

    applyImport(result);

    await messageDialog("information", labels.importDoneTitle, labels.importApplySuccess);
  } catch (err) {
    await messageDialog(
      "error",
      labels.importFailedTitle,
      labels.importApplyFailed.replace("{error}", err instanceof Error ? err.message : String(err))
    );
  }
}

export async function startImport(): Promise<void> {
  return runImportFlow(showImportDialog);
}

export async function startImportFromText(): Promise<void> {
  return runImportFlow(showImportFromTextDialog);
}

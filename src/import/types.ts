import type { Folder, SavedRequest } from "../types";

export type ImportSource = "restpilot" | "postman" | "openapi" | "curl";

export type ImportTreeNode = {
  id: string;
  title: string;
  kind: "folder" | "request";
  selected: boolean;
  method?: string;
  url?: string;
  children?: ImportTreeNode[];
};

export type ImportParseResult = {
  folders: Folder[];
  requests: SavedRequest[];
  tree: ImportTreeNode[];
  name: string;
  description?: string;
};

export type ImportDialogData = {
  source: ImportSource;
  filePath?: string;
  curlText?: string;
  parseResult?: ImportParseResult;
  selectedIds?: string[];
  targetFolderId?: string;
  importMode?: "merge" | "replace";
  conflictPolicy?: "rename" | "skip";
};

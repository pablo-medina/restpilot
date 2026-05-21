import { COLLECTION_ROOT_PARENT_ID, isCollectionRoot, normalizeParentId } from "../app/collection-parent";
import {
  collectionPathForFolder,
  collectionPathForParent,
  collectionPathForRequest,
  isInternalItemId,
  listCollectionFolderPaths,
  normalizeCollectionPath,
  resolveCollectionPath
} from "../app/collection-path";
import {
  buildSiblingNameConflict,
  duplicateTitleGroups,
  duplicateTitleKeySet,
  siblingNameConflictPayload,
  SiblingNameConflictError
} from "../app/collection-sibling-names";
import { blankRequest } from "../app/request-utils";
import { notifyCollectionChanged } from "../app/collection-mutation";
import { ensureFolderPathExists } from "../app/collection-ensure-folders";
import { insertItemAt } from "../app/collection-store";
import { hydrateRequestAuth, redactRequestAuthForExport } from "../app/request-auth";
import { getItem, id, state } from "../app/state";
import type { AiToolPolicy, BodyMode, Folder, RawType, SavedRequest } from "../types";
import { normalizeRequestBodyArg, type NormalizeRequestBodyResult } from "../json-request-body";
import { executeFunctionAiTool, FUNCTION_AI_TOOL_DEFINITIONS } from "./function-tools";
import { runFunctionById, runSavedRequestById } from "./request-runner";

export const AI_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "list_requests",
      description:
        "List all folders and saved requests (id, title, method, url, host, path). Call when you need request_id or to see what exists. duplicate_titles: disambiguate by path.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "get_request",
      description:
        "Load a saved request by id (method, url, headers, body; secrets redacted). REQUIRED when the user asks what a request sends, its body/JSON, headers, or URL — call immediately; never say you lack access.",
      parameters: {
        type: "object",
        properties: { request_id: { type: "string", description: "Saved request id" } },
        required: ["request_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_request",
      description:
        "Execute a saved request by id (real HTTP). Call when the user wants to run/send/call/execute/test it. If they pick an item from a list you just gave (ordinal or short confirmation), use that item's request_id. Do not list again instead of sending.",
      parameters: {
        type: "object",
        properties: { request_id: { type: "string", description: "Saved request id" } },
        required: ["request_id"],
        additionalProperties: false
      }
    }
  },
  ...FUNCTION_AI_TOOL_DEFINITIONS,
  {
    type: "function",
    function: {
      name: "run_function",
      description:
        "Run a saved RestPilot function by id. Call only when the user explicitly asks to run or execute that function.",
      parameters: {
        type: "object",
        properties: { function_id: { type: "string", description: "Function id" } },
        required: ["function_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_request_draft",
      description:
        "Create a saved request. parent_path (e.g. /data) is created automatically if missing. Set method, full URL, and body when needed. POST/PUT/PATCH need a valid JSON body object. parent_path / = root. If same title+URL exists, use update_request instead.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          method: { type: "string" },
          url: { type: "string" },
          parent_path: {
            type: "string",
            description: "Folder path: \"/\" = collection root, \"/OpenRouter\" = folder at root, \"/Prueba/Sub\" = nested"
          },
          parent_id: {
            type: "string",
            description: "Same as parent_path, or internal folder id (prefer parent_path)"
          },
          body_mode: { type: "string", enum: ["none", "raw", "form"], description: "Default raw when body is set" },
          raw_type: { type: "string", enum: ["json", "text", "xml", "html"] },
          body: {
            description:
              "Request body as a JSON object (required for POST/PUT/PATCH). Do not pass a string unless every inner quote is escaped (\\\"). Use response_format as a top-level object for chat APIs; never raw {\"…\"} inside messages[].content.",
            oneOf: [{ type: "object" }, { type: "array" }, { type: "string" }]
          },
          description: {
            type: "string",
            description:
              "Optional: what this request does (for the user and AI). Not shown in the collection tree except as a tooltip."
          }
        },
        required: ["title", "method", "url"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_request",
      description:
        "Update an existing saved request (title, method, url, body). Use when the user asks to change fields or when create would duplicate. Include body for POST/PUT/PATCH when missing or incomplete. Requires request_id from list_requests or a prior tool result.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
          title: { type: "string" },
          method: { type: "string" },
          url: { type: "string" },
          body_mode: { type: "string", enum: ["none", "raw", "form"] },
          raw_type: { type: "string", enum: ["json", "text", "xml", "html"] },
          body: {
            description:
              "Request body as a JSON object. Do not pass a string unless every inner quote is escaped (\\\"). Use response_format as a top-level object for chat APIs.",
            oneOf: [{ type: "object" }, { type: "array" }, { type: "string" }]
          },
          description: {
            type: "string",
            description: "What this request does (for the user and AI)"
          }
        },
        required: ["request_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description:
        "Ensure a folder path exists. Pass title + parent_path (e.g. title data, parent_path /) or a single folder path (e.g. parent_path /data). Creates missing parents automatically. create_request_draft also auto-creates parent_path — you usually do not need this unless the user only asked for a folder.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Folder name (last segment). Optional if parent_path is a full folder path like /data" },
          parent_path: {
            type: "string",
            description: "Parent path (/), full folder path (/data), or alias parent_id"
          },
          parent_id: { type: "string", description: "Alias for parent_path" }
        },
        additionalProperties: false
      }
    }
  }
] as const;

const READ_ONLY_TOOLS = new Set(["list_requests", "get_request", "list_functions", "get_function"]);

export function isReadOnlyAiTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name);
}

export function shouldConfirmAiTool(policy: AiToolPolicy, name: string): boolean {
  if (policy === "confirm_all") return true;
  if (policy === "auto_all") return false;
  return !isReadOnlyAiTool(name);
}

export { describeAiToolCall } from "./actions";

function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function listRequests(): string {
  const duplicateKeys = duplicateTitleKeySet();
  const items = state.items.map((item) => {
    const duplicateTitle = duplicateKeys.has(`${item.kind}\0${item.title.trim().toLowerCase()}`);
    if (item.kind === "folder") {
      const folder = item as Folder;
      return {
        kind: "folder",
        id: folder.id,
        title: folder.title,
        path: collectionPathForFolder(folder),
        duplicate_title: duplicateTitle
      };
    }
    const req = item as SavedRequest;
    return {
      kind: "request",
      id: req.id,
      title: req.title,
      method: req.method,
      url: req.url,
      host: urlHost(req.url),
      path: collectionPathForRequest(req),
      duplicate_title: duplicateTitle,
      has_description: Boolean(req.description?.trim())
    };
  });
  return JSON.stringify({ items, duplicate_titles: duplicateTitleGroups() }, null, 2);
}

function getRequest(requestId: string): string {
  const item = getItem(requestId);
  if (!item || item.kind !== "request") {
    return JSON.stringify({ error: `Request not found: ${requestId}` });
  }
  const copy = {
    ...item,
    auth: redactRequestAuthForExport(item.auth)
  };
  return JSON.stringify(copy, null, 2);
}

function normalizeBodyMode(value: unknown): BodyMode {
  const mode = String(value ?? "").toLowerCase();
  if (mode === "none" || mode === "form" || mode === "binary" || mode === "graphql") return mode;
  return "raw";
}

function normalizeRawType(value: unknown): RawType {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "json" || raw === "xml") return raw;
  return "text";
}

function applyBodyFields(
  request: SavedRequest,
  args: Record<string, unknown>
): NormalizeRequestBodyResult | null {
  if (args.body_mode !== undefined) request.bodyMode = normalizeBodyMode(args.body_mode);
  if (args.raw_type !== undefined) request.rawType = normalizeRawType(args.raw_type);
  if (args.body === undefined) return null;

  const normalized = normalizeRequestBodyArg(args.body, request.rawType);
  request.body = normalized.body;
  if (request.body.trim() && request.bodyMode === "none") {
    request.bodyMode = "raw";
  }
  if (request.body.trim() && shouldDefaultJsonRawType(request.rawType, args)) {
    request.rawType = "json";
  }
  return normalized;
}

function shouldDefaultJsonRawType(current: RawType, args: Record<string, unknown>): boolean {
  if (args.raw_type !== undefined) return false;
  if (current === "json") return false;
  if (typeof args.body === "object" && args.body !== null) return true;
  const text = String(args.body ?? "").trimStart();
  return text.startsWith("{") || text.startsWith("[");
}

/** GET/HEAD without an explicit body → Body tab "None" (not an empty Raw editor). */
function applyDefaultBodyModeWhenEmpty(request: SavedRequest, args: Record<string, unknown>) {
  if (args.body !== undefined || args.body_mode !== undefined) return;
  if (request.body.trim()) return;
  const method = request.method.trim().toUpperCase();
  if (method === "GET" || method === "HEAD") {
    request.bodyMode = "none";
    request.body = "";
  }
}

function requestBodySummary(request: SavedRequest, bodyMeta?: NormalizeRequestBodyResult | null) {
  const summary: Record<string, unknown> = {
    body_mode: request.bodyMode,
    has_body: request.bodyMode !== "none" && Boolean(request.body.trim())
  };
  if (request.rawType === "json" || request.body.trimStart().startsWith("{")) {
    summary.body_json_valid = bodyMeta?.valid ?? tryBodyJsonValid(request.body);
    if (bodyMeta?.repaired) summary.body_json_repaired = true;
    if (bodyMeta && !bodyMeta.valid) {
      summary.body_json_error =
        "Body is not valid JSON; fix escaped quotes in strings or pass body as a JSON object in the tool call.";
    }
  }
  return summary;
}

function tryBodyJsonValid(body: string): boolean {
  if (!body.trim()) return true;
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

function parseCreateFolderArgs(args: Record<string, unknown>): { title: string; parentPath: string } {
  let title = String(args.title ?? "").trim();
  let parentPath = normalizeCollectionPath(
    String(args.parent_path ?? args.parent_id ?? COLLECTION_ROOT_PARENT_ID)
  );

  if (!title) {
    const segments = parentPath === COLLECTION_ROOT_PARENT_ID ? [] : parentPath.slice(1).split("/").filter(Boolean);
    if (segments.length === 1) {
      title = segments[0]!;
      parentPath = COLLECTION_ROOT_PARENT_ID;
    } else if (segments.length > 1) {
      title = segments[segments.length - 1]!;
      parentPath = `/${segments.slice(0, -1).join("/")}`;
    } else {
      title = "New folder";
    }
  }

  return { title, parentPath };
}

function resolveRequestParent(args: Record<string, unknown>): {
  parentId: string;
  parentPath: string;
  foldersCreated: Array<{ folder_id: string; path: string; title: string }>;
} {
  const rawPath =
    args.parent_path !== undefined && args.parent_path !== null
      ? normalizeCollectionPath(String(args.parent_path))
      : args.parent_id !== undefined && args.parent_id !== null
        ? isInternalItemId(String(args.parent_id))
          ? null
          : normalizeCollectionPath(String(args.parent_id))
        : null;

  if (rawPath === null && args.parent_id !== undefined) {
    return {
      parentId: normalizeParentId(String(args.parent_id)),
      parentPath: collectionPathForParent(normalizeParentId(String(args.parent_id))),
      foldersCreated: []
    };
  }

  const folderPath = rawPath ?? COLLECTION_ROOT_PARENT_ID;
  if (isCollectionRoot(folderPath)) {
    return { parentId: COLLECTION_ROOT_PARENT_ID, parentPath: folderPath, foldersCreated: [] };
  }

  const ensured = ensureFolderPathExists(folderPath);
  return {
    parentId: ensured.parentId,
    parentPath: ensured.path,
    foldersCreated: ensured.created
  };
}

function createFolder(args: Record<string, unknown>): string {
  const { title, parentPath } = parseCreateFolderArgs(args);
  const parentEnsured = ensureFolderPathExists(parentPath);
  const folderPath =
    parentPath === COLLECTION_ROOT_PARENT_ID ? `/${title}` : `${parentPath}/${title}`;
  const existing = resolveCollectionPath(folderPath);
  if (!existing.missingPath) {
    const folder = getItem(existing.parentId);
    if (folder?.kind === "folder") {
      return JSON.stringify({
        created: false,
        already_exists: true,
        folder_id: folder.id,
        title: folder.title,
        path: folderPath,
        folders_created: parentEnsured.created
      });
    }
  }

  const ensured = ensureFolderPathExists(folderPath);
  notifyCollectionChanged();
  const leaf = ensured.created[ensured.created.length - 1];
  return JSON.stringify({
    created: ensured.created.length > 0,
    folder_id: ensured.parentId,
    title: leaf?.title ?? title,
    path: folderPath,
    folders_created: [...parentEnsured.created, ...ensured.created]
  });
}

function findMatchingRequest(title: string, method: string, url: string): SavedRequest | null {
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedUrl = url.trim();
  const normalizedMethod = method.trim().toUpperCase();
  for (const item of state.items) {
    if (item.kind !== "request") continue;
    if (
      item.title.trim().toLowerCase() === normalizedTitle &&
      item.url.trim() === normalizedUrl &&
      item.method.trim().toUpperCase() === normalizedMethod
    ) {
      return item;
    }
  }
  return null;
}

async function createRequestDraft(args: Record<string, unknown>): Promise<string> {
  const title = String(args.title ?? "New request").trim() || "New request";
  const method = String(args.method ?? "GET").trim().toUpperCase() || "GET";
  const url = String(args.url ?? "").trim();
  const { parentId, parentPath, foldersCreated } = resolveRequestParent(args);
  if (!isCollectionRoot(parentId)) {
    const parent = getItem(parentId);
    if (!parent || parent.kind !== "folder") {
      return JSON.stringify({
        error: `Parent folder not found: ${parentPath}`,
        available_paths: listCollectionFolderPaths()
      });
    }
  }

  const existing = findMatchingRequest(title, method, url);
  if (existing) {
    if (args.description !== undefined) {
      const description = String(args.description).trim();
      existing.description = description || undefined;
    }
    const bodyMeta = applyBodyFields(existing, args);
    notifyCollectionChanged();
    applyDefaultBodyModeWhenEmpty(existing, args);
    return JSON.stringify({
      created: false,
      already_exists: true,
      request_id: existing.id,
      title: existing.title,
      method: existing.method,
      url: existing.url,
      path: collectionPathForRequest(existing),
      ...requestBodySummary(existing, bodyMeta)
    });
  }

  const titleConflict = buildSiblingNameConflict(parentId, title);
  if (titleConflict) return JSON.stringify(siblingNameConflictPayload(titleConflict));

  const request = hydrateRequestAuth({
    ...blankRequest(parentId),
    title,
    method,
    url
  });
  if (args.description !== undefined) {
    const description = String(args.description).trim();
    request.description = description || undefined;
  }
  const bodyMeta = applyBodyFields(request, args);
  applyDefaultBodyModeWhenEmpty(request, args);
  try {
    insertItemAt(request, parentId, Number.MAX_SAFE_INTEGER);
  } catch (error) {
    if (error instanceof SiblingNameConflictError) {
      return JSON.stringify(siblingNameConflictPayload(error.conflict));
    }
    throw error;
  }
  if (!isCollectionRoot(parentId)) {
    const parent = getItem(parentId);
    if (parent?.kind === "folder") parent.expanded = true;
  }
  state.selectedTreeId = request.id;
  if (!state.openTabs.includes(request.id)) {
    state.openTabs.push(request.id);
  }
  notifyCollectionChanged();
  return JSON.stringify(
    {
      created: true,
      request_id: request.id,
      title,
      method,
      url,
      path: collectionPathForRequest(request),
      parent_path: parentPath,
      folders_created: foldersCreated.length ? foldersCreated : undefined,
      has_description: Boolean(request.description?.trim()),
      ...requestBodySummary(request, bodyMeta)
    },
    null,
    2
  );
}

function updateRequest(args: Record<string, unknown>): string {
  const requestId = String(args.request_id ?? "").trim();
  const item = getItem(requestId);
  if (!item || item.kind !== "request") {
    return JSON.stringify({ error: `Request not found: ${requestId}` });
  }

  if (args.title !== undefined) {
    const title = String(args.title).trim();
    if (title) {
      const conflict = buildSiblingNameConflict(item.parentId, title, item.id);
      if (conflict) return JSON.stringify(siblingNameConflictPayload(conflict));
      item.title = title;
    }
  }
  if (args.method !== undefined) {
    const method = String(args.method).trim().toUpperCase();
    if (method) item.method = method;
  }
  if (args.url !== undefined) item.url = String(args.url).trim();
  if (args.description !== undefined) {
    const description = String(args.description).trim();
    item.description = description || undefined;
  }
  const bodyMeta = applyBodyFields(item, args);

  notifyCollectionChanged();
  return JSON.stringify({
    updated: true,
    request_id: item.id,
    title: item.title,
    method: item.method,
    url: item.url,
    has_description: Boolean(item.description?.trim()),
    ...requestBodySummary(item, bodyMeta)
  });
}

export async function executeAiTool(name: string, argsJson: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: "Invalid tool arguments JSON" });
  }

  switch (name) {
    case "list_requests":
      return listRequests();
    case "get_request":
      return getRequest(String(args.request_id ?? ""));
    case "send_request":
      return runSavedRequestById(String(args.request_id ?? ""));
    case "run_function":
      return runFunctionById(String(args.function_id ?? ""));
    case "create_request_draft":
      return createRequestDraft(args);
    case "create_folder":
      return createFolder(args);
    case "update_request":
      return updateRequest(args);
    default: {
      const functionResult = executeFunctionAiTool(name, args);
      if (functionResult !== null) return functionResult;
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }
}

export function appendToolResultMessage(toolCallId: string, name: string, content: string) {
  state.aiChat.messages.push({
    id: id(),
    role: "tool",
    toolCallId,
    toolName: name,
    content
  });
}

export function appendAssistantToolCallMessage(
  toolCalls: Array<{ id: string; name: string; arguments: string }>
) {
  state.aiChat.messages.push({
    id: id(),
    role: "assistant",
    content: "",
    pending: false
  });
  // OpenAI expects assistant message with tool_calls before tool results — store as JSON in content for API rebuild
  const last = state.aiChat.messages[state.aiChat.messages.length - 1];
  if (last) {
    last.content = JSON.stringify({ tool_calls: toolCalls });
  }
}

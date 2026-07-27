import type { Folder, Pair, SavedRequest } from "../types";
import type { ImportParseResult, ImportTreeNode } from "./types";

function id(): string {
  return crypto.randomUUID();
}

function parseOpenApiUrl(urlStr: string, serverUrl: string | undefined): string {
  if (serverUrl) {
    const base = serverUrl.replace(/\/+$/, "");
    const path = urlStr.startsWith("/") ? urlStr : "/" + urlStr;
    return base + path;
  }
  return urlStr;
}

/** Parameters declared for `location` (`query`, `header` or `path`) as editable pairs. */
function extractParams(params: unknown, location: "query" | "header" | "path"): Pair[] {
  if (!Array.isArray(params)) return [];
  return params
    .filter((p: unknown) => p && typeof p === "object" && (p as Record<string, unknown>).in === location)
    .map((p: unknown) => {
      const item = p as Record<string, unknown>;
      return {
        id: id(),
        key: String(item.name ?? ""),
        value: String((item.schema as Record<string, unknown> | undefined)?.default ?? item.example ?? ""),
        enabled: true
      };
    });
}

function oasBodyToForm(schema: Record<string, unknown>): Pair[] {
  if (!schema.properties || typeof schema.properties !== "object") return [];
  const props = schema.properties as Record<string, unknown>;
  return Object.entries(props).map(([key, val]) => ({
    id: id(),
    key,
    value: String((val as Record<string, unknown>)?.default ?? (val as Record<string, unknown>)?.example ?? ""),
    enabled: true
  }));
}

function oasContentToBody(content: unknown): {
  bodyMode: "raw" | "form" | "none" | "multipart";
  body: string;
  form: Pair[];
} {
  if (!content || typeof content !== "object") return { bodyMode: "none", body: "", form: [] };
  const entries = Object.entries(content as Record<string, unknown>);
  if (entries.length === 0) return { bodyMode: "none", body: "", form: [] };

  const [mimeType, mediaType] = entries[0];
  const mt = mediaType as Record<string, unknown> | undefined;
  const schema = mt?.schema as Record<string, unknown> | undefined;

  if (mimeType === "application/x-www-form-urlencoded" && schema) {
    return { bodyMode: "form", body: "", form: oasBodyToForm(schema) };
  }
  if (mimeType.startsWith("multipart/") && schema) {
    return {
      bodyMode: "multipart",
      body: "",
      form: oasBodyToForm(schema).map((f) => ({ ...f, partType: "text" as const }))
    };
  }

  let example = "";
  if (mt?.example) {
    example = typeof mt.example === "string" ? mt.example : JSON.stringify(mt.example, null, 2);
  } else if (schema) {
    example = JSON.stringify(schema.example ?? schema.default ?? "", null, 2);
  } else if (typeof mt === "object" && mt !== null) {
    example = JSON.stringify(mt, null, 2);
  }

  return { bodyMode: "raw", body: example, form: [] };
}

function inferRawType(contentType: string): "json" | "text" | "xml" {
  if (contentType.includes("json")) return "json";
  if (contentType.includes("xml")) return "xml";
  return "text";
}

function parseOperation(
  path: string,
  method: string,
  op: Record<string, unknown>,
  serverUrl: string | undefined,
  parentId: string,
  requests: SavedRequest[],
  treeNodes: ImportTreeNode[]
): void {
  if (!op || typeof op !== "object") return;
  const summary = String(op.summary ?? op.operationId ?? `${method.toUpperCase()} ${path}`);
  const description = typeof op.description === "string" ? op.description : undefined;

  const queryParams = extractParams(op.parameters, "query");
  const headerParams = extractParams(op.parameters, "header");
  const pathParams = extractParams(op.parameters, "path");
  const resolvedUrl = parseOpenApiUrl(path, serverUrl);

  let body = "";
  let form: Pair[] = [];
  let bodyMode: "raw" | "form" | "none" | "multipart" = "none";
  let rawType: "json" | "text" | "xml" = "text";

  const rb = op.requestBody as Record<string, unknown> | undefined;
  if (rb?.content) {
    const result = oasContentToBody(rb.content);
    bodyMode = result.bodyMode;
    body = result.body;
    form = result.form;
    if (result.bodyMode === "raw") {
      const content = rb.content as Record<string, unknown>;
      const keys = Object.keys(content);
      if (keys.length > 0) rawType = inferRawType(keys[0]);
    }
  }

  const request: SavedRequest = {
    id: id(),
    kind: "request",
    parentId,
    title: summary,
    description,
    method: method.toUpperCase(),
    url: resolvedUrl,
    queryParams: [...pathParams, ...queryParams],
    headers: headerParams,
    bodyMode,
    rawType,
    body,
    form,
    streamResponse: false,
    auth: { type: "none" },
    lastResponse: null,
    lastError: null
  };

  requests.push(request);
  treeNodes.push({
    id: request.id,
    title: summary,
    kind: "request",
    selected: true,
    method: request.method,
    url: request.url
  });
}

export function parseOpenApiSpec(json: string): ImportParseResult {
  const raw = JSON.parse(json);
  if (!raw || typeof raw !== "object") throw new Error("Invalid OpenAPI spec: not an object");

  const version = String(raw.openapi ?? raw.swagger ?? "");
  if (!version) throw new Error("Invalid OpenAPI spec: missing 'openapi' or 'swagger' field");

  const info = raw.info as Record<string, unknown> | undefined;
  const name = String(info?.title ?? raw.info?.title ?? "Imported API");
  const description = typeof info?.description === "string" ? info.description : undefined;

  let serverUrl: string | undefined;
  if (Array.isArray(raw.servers) && raw.servers.length > 0) {
    serverUrl = String((raw.servers[0] as Record<string, unknown>)?.url ?? "").replace(/\/+$/, "");
  }

  const paths = raw.paths as Record<string, unknown> | undefined;
  if (!paths || typeof paths !== "object") throw new Error("Invalid OpenAPI spec: missing 'paths' object");

  const folders: Folder[] = [];
  const requests: SavedRequest[] = [];
  const tree: ImportTreeNode[] = [];

  const groupFolderId = id();
  folders.push({ id: groupFolderId, kind: "folder", parentId: "/", title: name, expanded: false });
  const groupChildren: ImportTreeNode[] = [];

  const methods = ["get", "post", "put", "patch", "delete", "head", "options"];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const pi = pathItem as Record<string, unknown>;

    const pathSummary = typeof pi.summary === "string" ? pi.summary : undefined;
    let pathFolderId = groupFolderId;
    let pathChildren = groupChildren;

    const hasMultipleOps = methods.filter((m) => pi[m] && typeof pi[m] === "object").length > 1;
    if (hasMultipleOps) {
      pathFolderId = id();
      folders.push({
        id: pathFolderId,
        kind: "folder",
        parentId: groupFolderId,
        title: pathSummary ?? path,
        expanded: false
      });
      pathChildren = [];
      groupChildren.push({
        id: pathFolderId,
        title: pathSummary ?? path,
        kind: "folder",
        selected: true,
        children: pathChildren
      });
    } else {
      const singleOp = methods.find((m) => pi[m] && typeof pi[m] === "object");
      if (singleOp) {
        groupChildren.push({
          id: id(),
          title: pathSummary ?? path,
          kind: "folder",
          selected: true,
          children: pathChildren
        });
      }
    }

    for (const method of methods) {
      const op = pi[method] as Record<string, unknown> | undefined;
      if (!op) continue;
      parseOperation(path, method, op, serverUrl, pathFolderId, requests, pathChildren);
    }
  }

  tree.push({ id: groupFolderId, title: name, kind: "folder", selected: true, children: groupChildren });

  return { folders, requests, tree, name, description };
}

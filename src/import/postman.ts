import type { Folder, Pair, RawType, RequestAuth, SavedRequest } from "../types";
import type { ImportParseResult, ImportTreeNode } from "./types";

function id(): string {
  return crypto.randomUUID();
}

function parsePostmanUrl(url: unknown): string {
  if (!url || typeof url === "string") return String(url ?? "");
  const obj = url as Record<string, unknown>;
  if (obj.raw && typeof obj.raw === "string") return obj.raw;
  let result = "";
  if (obj.protocol) result += String(obj.protocol) + "://";
  if (Array.isArray(obj.host)) result += obj.host.join(".");
  if (obj.port && obj.port !== "443" && obj.port !== "80") result += ":" + String(obj.port);
  if (Array.isArray(obj.path)) result += "/" + obj.path.map(String).join("/");
  if (Array.isArray(obj.variable)) {
    for (const v of obj.variable) {
      if (v && typeof v === "object" && "key" in v && "value" in v) {
        const key = String((v as Record<string, unknown>).key);
        const val = String((v as Record<string, unknown>).value ?? "");
        result = result.replace(new RegExp(`:${key}\\b`), encodeURIComponent(val));
      }
    }
  }
  return result;
}

function parsePostmanQueryParams(url: unknown): Pair[] {
  if (!url || typeof url === "string") return [];
  const obj = url as Record<string, unknown>;
  if (!Array.isArray(obj.query)) return [];
  return obj.query
    .filter((q: unknown) => q && typeof q === "object")
    .map((q: unknown) => {
      const item = q as Record<string, unknown>;
      return {
        id: id(),
        key: String(item.key ?? ""),
        value: String(item.value ?? ""),
        enabled: item.disabled !== true
      };
    });
}

function parsePostmanHeaders(headers: unknown): Pair[] {
  if (!Array.isArray(headers)) return [];
  return headers
    .filter((h: unknown) => h && typeof h === "object")
    .map((h: unknown) => {
      const item = h as Record<string, unknown>;
      return {
        id: id(),
        key: String(item.key ?? ""),
        value: String(item.value ?? ""),
        enabled: item.disabled !== true
      };
    });
}

function parsePostmanAuth(auth: unknown): RequestAuth {
  if (!auth || typeof auth !== "object") return { type: "none" };
  const obj = auth as Record<string, unknown>;
  const pmType = String(obj.type ?? "noauth");
  const vals = (arr: unknown): Record<string, string> => {
    if (!Array.isArray(arr)) return {};
    const result: Record<string, string> = {};
    for (const item of arr) {
      if (item && typeof item === "object") {
        const i = item as Record<string, unknown>;
        result[String(i.key ?? "")] = String(i.value ?? "");
      }
    }
    return result;
  };
  const v = vals(obj[pmType]);
  if (pmType === "bearer") return { type: "bearer", bearerToken: v.token ?? v.value ?? "" };
  if (pmType === "basic") return { type: "basic", basicUsername: v.username ?? "", basicPassword: v.password ?? "" };
  if (pmType === "apikey")
    return { type: "apikey", apiKeyName: v.key ?? "", apiKeyValue: v.value ?? "", apiKeyIn: v.in === "query" ? "query" : "header" };
  return { type: "none" };
}

function parsePostmanBody(body: unknown): { bodyMode: "raw" | "form" | "none" | "multipart"; rawType: RawType; body: string; form: Pair[] } {
  if (!body || typeof body !== "object") return { bodyMode: "none", rawType: "text", body: "", form: [] };
  const obj = body as Record<string, unknown>;
  const mode = String(obj.mode ?? "none");

  if (mode === "raw") {
    const rawText = String(obj.raw ?? "");
    const opts = obj.options as Record<string, unknown> | undefined;
    const rawOpts = opts?.raw as Record<string, unknown> | undefined;
    const lang = String(rawOpts?.language ?? "text");
    const rawType: RawType = lang === "json" ? "json" : lang === "xml" ? "xml" : "text";
    return { bodyMode: "raw", rawType, body: rawText, form: [] };
  }

  if (mode === "urlencoded") {
    const pairs = Array.isArray(obj.urlencoded)
      ? obj.urlencoded
          .filter((f: unknown) => f && typeof f === "object")
          .map((f: unknown) => {
            const item = f as Record<string, unknown>;
            return {
              id: id(),
              key: String(item.key ?? ""),
              value: String(item.value ?? ""),
              enabled: item.disabled !== true
            };
          })
      : [];
    return { bodyMode: "form", rawType: "text", body: "", form: pairs };
  }

  if (mode === "formdata") {
    const pairs = Array.isArray(obj.formdata)
      ? obj.formdata
          .filter((f: unknown) => f && typeof f === "object")
          .map((f: unknown) => {
            const item = f as Record<string, unknown>;
            return {
              id: id(),
              key: String(item.key ?? ""),
              value: String(item.value ?? item.src ?? ""),
              enabled: item.disabled !== true,
              partType: (item.type === "file" ? "file" : "text") as "file" | "text",
              fileName: item.type === "file" && item.src ? String(item.src).split(/[/\\]/).pop() : undefined
            };
          })
      : [];
    return { bodyMode: "multipart", rawType: "text", body: "", form: pairs };
  }

  return { bodyMode: "none", rawType: "text", body: "", form: [] };
}

function buildRequest(item: Record<string, unknown>, parentId: string, inheritAuth: RequestAuth): SavedRequest {
  const req = item.request as Record<string, unknown> | undefined;
  const method = String(req?.method ?? "GET").toUpperCase();
  const url = parsePostmanUrl(req?.url);
  const queryParams = parsePostmanQueryParams(req?.url);
  const headers = parsePostmanHeaders(req?.header);
  const auth = req?.auth ? parsePostmanAuth(req?.auth) : inheritAuth;
  const description = typeof item.description === "string" ? item.description : undefined;
  const bodyResult = parsePostmanBody(req?.body);

  return {
    id: id(),
    kind: "request",
    parentId,
    title: String(item.name ?? "Untitled"),
    description,
    method,
    url,
    queryParams,
    headers,
    ...bodyResult,
    streamResponse: false,
    auth,
    lastResponse: null,
    lastError: null
  };
}

function flattenTree(
  items: unknown[],
  parentId: string,
  inheritAuth: RequestAuth,
  folders: Folder[],
  requests: SavedRequest[],
  treeNodes: ImportTreeNode[]
): void {
  if (!Array.isArray(items)) return;
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const name = String(item.name ?? "Untitled");
    const hasItems = Array.isArray(item.item);
    const childAuth = item.auth ? parsePostmanAuth(item.auth) : inheritAuth;

    if (hasItems) {
      const folderId = id();
      folders.push({ id: folderId, kind: "folder", parentId, title: name, expanded: false });
      const children: ImportTreeNode[] = [];
      flattenTree(item.item as unknown[], folderId, childAuth, folders, requests, children);
      treeNodes.push({ id: folderId, title: name, kind: "folder", selected: true, children });
    } else if (item.request) {
      const request = buildRequest(item, parentId, childAuth);
      requests.push(request);
      treeNodes.push({
        id: request.id,
        title: request.title,
        kind: "request",
        selected: true,
        method: request.method,
        url: request.url
      });
    }
  }
}

export function parsePostmanCollection(json: string): ImportParseResult {
  const raw = JSON.parse(json);
  if (!raw || typeof raw !== "object") throw new Error("Invalid Postman collection: not an object");
  if (!Array.isArray(raw.item)) throw new Error("Invalid Postman collection: missing 'item' array");
  const info = raw.info as Record<string, unknown> | undefined;
  const name = String(info?.name ?? raw.name ?? "Imported Collection");
  const description = typeof info?.description === "string"
    ? info.description
    : typeof info?.description === "object"
      ? String((info.description as Record<string, unknown>).content ?? "")
      : undefined;
  const collectionAuth = raw.auth ? parsePostmanAuth(raw.auth) : undefined;

  const folders: Folder[] = [];
  const requests: SavedRequest[] = [];
  const tree: ImportTreeNode[] = [];

  flattenTree(raw.item, "/", collectionAuth ?? { type: "none" }, folders, requests, tree);

  return { folders, requests, tree, name, description };
}

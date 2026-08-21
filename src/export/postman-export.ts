import type { Pair, RequestAuth, SavedRequest, TreeItem } from "../types";
import { COLLECTION_ROOT_PARENT_ID } from "../app/collection-parent";
import { compactBase64, decodeBasicCredentials } from "../lib/basic-auth";

function postmanAuth(auth: RequestAuth): Record<string, unknown> | undefined {
  if (auth.type === "none") return undefined;
  if (auth.type === "bearer") {
    return {
      type: "bearer",
      bearer: [{ key: "token", value: auth.bearerToken ?? "", type: "string" }]
    };
  }
  if (auth.type === "basic") {
    // Postman's basic auth block only carries username/password, so a base64 token is
    // decoded back into the pair. Tokens that can't be decoded fall back to a raw header
    // (see `postmanBasicHeader`).
    const credentials =
      auth.basicMode === "token"
        ? decodeBasicCredentials(auth.basicToken ?? "")
        : { username: auth.basicUsername ?? "", password: auth.basicPassword ?? "" };
    if (!credentials) return undefined;
    return {
      type: "basic",
      basic: [
        { key: "username", value: credentials.username, type: "string" },
        { key: "password", value: credentials.password, type: "string" }
      ]
    };
  }
  if (auth.type === "apikey") {
    return {
      type: "apikey",
      apikey: [
        { key: "key", value: auth.apiKeyName ?? "", type: "string" },
        { key: "value", value: auth.apiKeyValue ?? "", type: "string" },
        { key: "in", value: auth.apiKeyIn === "query" ? "query" : "header", type: "string" }
      ]
    };
  }
  return undefined;
}

function postmanHeaders(headers: Pair[]): Array<Record<string, unknown>> {
  return headers
    .filter((header) => header.enabled && header.key.trim())
    .map((header) => ({
      key: header.key.trim(),
      value: header.value,
      type: "text"
    }));
}

function postmanBody(request: SavedRequest): Record<string, unknown> | undefined {
  if (request.bodyMode === "none") return undefined;

  if (request.bodyMode === "raw") {
    const language = request.rawType === "json" ? "json" : request.rawType === "xml" ? "xml" : "text";
    return {
      mode: "raw",
      raw: request.body,
      options: { raw: { language } }
    };
  }

  if (request.bodyMode === "form") {
    return {
      mode: "urlencoded",
      urlencoded: request.form
        .filter((field) => field.enabled && field.key.trim())
        .map((field) => ({
          key: field.key,
          value: field.value,
          type: "text",
          disabled: false
        }))
    };
  }

  if (request.bodyMode === "multipart") {
    return {
      mode: "formdata",
      formdata: request.form
        .filter((field) => field.enabled && field.key.trim())
        .map((field) => {
          if (field.partType === "file") {
            return {
              key: field.key,
              type: "file",
              src: field.fileName ?? "",
              disabled: false
            };
          }
          return {
            key: field.key,
            value: field.value,
            type: "text",
            disabled: false
          };
        })
    };
  }

  if (request.bodyMode === "graphql") {
    const query = request.body;
    const variables = request.graphqlVariables ?? "";
    const raw = variables ? `${query}\n\n${variables}` : query;
    return {
      mode: "raw",
      raw,
      options: { raw: { language: "json" } }
    };
  }

  return undefined;
}

/** Opaque base64 token that Postman's basic auth block can't represent — export it as a header. */
function postmanBasicHeader(auth: RequestAuth): Record<string, unknown> | undefined {
  if (auth.type !== "basic" || auth.basicMode !== "token") return undefined;
  if (decodeBasicCredentials(auth.basicToken ?? "")) return undefined;
  const token = compactBase64(auth.basicToken ?? "");
  if (!token) return undefined;
  return { key: "Authorization", value: `Basic ${token}`, type: "text" };
}

function postmanRequest(request: SavedRequest): Record<string, unknown> {
  const auth = postmanAuth(request.auth);
  const basicHeader = postmanBasicHeader(request.auth);
  const headers = postmanHeaders(request.headers);
  if (basicHeader) headers.push(basicHeader);
  const body = postmanBody(request);
  const result: Record<string, unknown> = {
    method: request.method.toUpperCase(),
    header: headers,
    url: request.url.trim(),
    description: request.description ?? ""
  };
  if (auth) result.auth = auth;
  if (body) result.body = body;
  return result;
}

function buildPostmanItems(parentId: string, items: TreeItem[]): unknown[] {
  const children = items.filter((item) => item.parentId === parentId);
  const nodes: unknown[] = [];

  for (const child of children) {
    if (child.kind === "folder") {
      nodes.push({
        name: child.title,
        item: buildPostmanItems(child.id, items)
      });
      continue;
    }
    nodes.push({
      name: child.title,
      request: postmanRequest(child)
    });
  }

  return nodes;
}

export function buildPostmanCollectionExport(snapshot: {
  folderName: string;
  folderId: string;
  items: TreeItem[];
}): Record<string, unknown> {
  return {
    info: {
      _postman_id: crypto.randomUUID(),
      name: snapshot.folderName,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    item: buildPostmanItems(COLLECTION_ROOT_PARENT_ID, snapshot.items)
  };
}

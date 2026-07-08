import type { Pair, RequestAuth, SavedRequest, TreeItem } from "../types";
import { COLLECTION_ROOT_PARENT_ID } from "../app/collection-parent";

function toPostmanVar(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, "{{$1}}");
}

function postmanAuth(auth: RequestAuth): Record<string, unknown> | undefined {
  if (auth.type === "none") return undefined;
  if (auth.type === "bearer") {
    return {
      type: "bearer",
      bearer: [{ key: "token", value: toPostmanVar(auth.bearerToken ?? ""), type: "string" }]
    };
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      basic: [
        { key: "username", value: toPostmanVar(auth.basicUsername ?? ""), type: "string" },
        { key: "password", value: toPostmanVar(auth.basicPassword ?? ""), type: "string" }
      ]
    };
  }
  if (auth.type === "apikey") {
    return {
      type: "apikey",
      apikey: [
        { key: "key", value: toPostmanVar(auth.apiKeyName ?? ""), type: "string" },
        { key: "value", value: toPostmanVar(auth.apiKeyValue ?? ""), type: "string" },
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
      key: toPostmanVar(header.key.trim()),
      value: toPostmanVar(header.value),
      type: "text"
    }));
}

function postmanBody(request: SavedRequest): Record<string, unknown> | undefined {
  if (request.bodyMode === "none") return undefined;

  if (request.bodyMode === "raw") {
    const language = request.rawType === "json" ? "json" : request.rawType === "xml" ? "xml" : "text";
    return {
      mode: "raw",
      raw: toPostmanVar(request.body),
      options: { raw: { language } }
    };
  }

  if (request.bodyMode === "form") {
    return {
      mode: "urlencoded",
      urlencoded: request.form
        .filter((field) => field.enabled && field.key.trim())
        .map((field) => ({
          key: toPostmanVar(field.key),
          value: toPostmanVar(field.value),
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
              key: toPostmanVar(field.key),
              type: "file",
              src: field.fileName ?? "",
              disabled: false
            };
          }
          return {
            key: toPostmanVar(field.key),
            value: toPostmanVar(field.value),
            type: "text",
            disabled: false
          };
        })
    };
  }

  if (request.bodyMode === "graphql") {
    const query = toPostmanVar(request.body);
    const variables = request.graphqlVariables ? toPostmanVar(request.graphqlVariables) : "";
    const raw = variables ? `${query}\n\n${variables}` : query;
    return {
      mode: "raw",
      raw,
      options: { raw: { language: "json" } }
    };
  }

  return undefined;
}

function postmanRequest(request: SavedRequest): Record<string, unknown> {
  const auth = postmanAuth(request.auth);
  const body = postmanBody(request);
  const result: Record<string, unknown> = {
    method: request.method.toUpperCase(),
    header: postmanHeaders(request.headers),
    url: toPostmanVar(request.url.trim()),
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

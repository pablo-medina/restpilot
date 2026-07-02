import { applyVariables } from "../lib/variables";
import { buildRequestUrl } from "../lib/url-params";
import type { Pair, RequestAuth, SavedRequest, Variable } from "../types";

export const AUTH_HEADER_NAME = "authorization";

export function defaultRequestAuth(): RequestAuth {
  return { type: "none" };
}

export function normalizeRequestAuth(auth: Partial<RequestAuth> | undefined): RequestAuth {
  const type = auth?.type ?? "none";
  if (type === "bearer") {
    return { type: "bearer", bearerToken: auth?.bearerToken ?? "" };
  }
  if (type === "basic") {
    return {
      type: "basic",
      basicUsername: auth?.basicUsername ?? "",
      basicPassword: auth?.basicPassword ?? ""
    };
  }
  if (type === "apikey") {
    const apiKeyIn = auth?.apiKeyIn === "query" ? "query" : "header";
    return {
      type: "apikey",
      apiKeyName: auth?.apiKeyName ?? "",
      apiKeyValue: auth?.apiKeyValue ?? "",
      apiKeyIn
    };
  }
  return defaultRequestAuth();
}

export function parseAuthFromHeaders(headers: Pair[]): { auth: RequestAuth; headers: Pair[] } {
  const remaining = headers.map((header) => ({ ...header }));
  const index = remaining.findIndex(
    (header) => header.enabled && header.key.trim().toLowerCase() === AUTH_HEADER_NAME
  );
  if (index < 0) {
    return { auth: defaultRequestAuth(), headers: remaining };
  }

  const authHeader = remaining[index]!;
  const value = authHeader.value.trim();
  remaining.splice(index, 1);

  const bearerMatch = /^bearer\s+(.+)$/i.exec(value);
  if (bearerMatch) {
    return { auth: { type: "bearer", bearerToken: bearerMatch[1]!.trim() }, headers: remaining };
  }

  const basicMatch = /^basic\s+(.+)$/i.exec(value);
  if (basicMatch) {
    try {
      const decoded = atob(basicMatch[1]!.trim());
      const colon = decoded.indexOf(":");
      const basicUsername = colon >= 0 ? decoded.slice(0, colon) : decoded;
      const basicPassword = colon >= 0 ? decoded.slice(colon + 1) : "";
      return { auth: { type: "basic", basicUsername, basicPassword }, headers: remaining };
    } catch {
      return { auth: defaultRequestAuth(), headers: remaining };
    }
  }

  return { auth: defaultRequestAuth(), headers: remaining };
}

function headerRecordFromPairs(headers: Pair[], variables: Variable[]) {
  return Object.fromEntries(
    headers
      .filter((header) => header.enabled && header.key.trim())
      .map((header) => [
        applyVariables(header.key.trim(), variables),
        applyVariables(header.value, variables)
      ])
  );
}

export function applyAuthHeaders(
  headers: Record<string, string>,
  auth: RequestAuth,
  variables: Variable[]
): Record<string, string> {
  const next = { ...headers };
  delete next[AUTH_HEADER_NAME];
  delete next.Authorization;

  if (auth.type === "bearer") {
    const token = applyVariables(auth.bearerToken ?? "", variables).trim();
    if (token) next.Authorization = `Bearer ${token}`;
    return next;
  }

  if (auth.type === "basic") {
    const username = applyVariables(auth.basicUsername ?? "", variables);
    const password = applyVariables(auth.basicPassword ?? "", variables);
    if (username || password) {
      next.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
    }
    return next;
  }

  if (auth.type === "apikey" && auth.apiKeyIn !== "query") {
    const name = applyVariables(auth.apiKeyName ?? "", variables).trim();
    const value = applyVariables(auth.apiKeyValue ?? "", variables);
    if (name) next[name] = value;
  }

  return next;
}

export function mergeAuthQueryParams(params: Pair[], auth: RequestAuth, variables: Variable[]): Pair[] {
  if (auth.type !== "apikey" || auth.apiKeyIn !== "query") {
    return params.map((pair) => ({ ...pair }));
  }

  const name = applyVariables(auth.apiKeyName ?? "", variables).trim();
  if (!name) return params.map((pair) => ({ ...pair }));

  const value = applyVariables(auth.apiKeyValue ?? "", variables);
  const withoutKey = params.filter((pair) => pair.key.trim() !== name);
  return [...withoutKey, { id: "auth-query", key: name, value, enabled: true }];
}

export function buildOutboundHeaders(
  request: SavedRequest,
  variables: Variable[]
): Record<string, string> {
  const manual = headerRecordFromPairs(request.headers, variables);
  return applyAuthHeaders(manual, normalizeRequestAuth(request.auth), variables);
}

export function buildOutboundQueryParams(request: SavedRequest, variables: Variable[]): Pair[] {
  const auth = normalizeRequestAuth(request.auth);
  if (auth.type !== "apikey" || auth.apiKeyIn !== "query") {
    return request.queryParams.map((pair) => ({ ...pair }));
  }
  return mergeAuthQueryParams(request.queryParams, auth, variables);
}

export function requestAuthTextFields(request: SavedRequest): string[] {
  const auth = normalizeRequestAuth(request.auth);
  if (auth.type === "bearer") return [auth.bearerToken ?? ""];
  if (auth.type === "basic") return [auth.basicUsername ?? "", auth.basicPassword ?? ""];
  if (auth.type === "apikey") return [auth.apiKeyName ?? "", auth.apiKeyValue ?? ""];
  return [];
}

export function resolvedOutboundUrl(request: SavedRequest, variables: Variable[]) {
  const params = buildOutboundQueryParams(request, variables);
  const base = applyVariables(request.url.trim(), variables);
  const hash = applyVariables(request.urlHash ?? "", variables);
  const resolvedParams = params
    .filter((pair) => pair.enabled && pair.key.trim())
    .map((pair) => ({
      ...pair,
      key: applyVariables(pair.key, variables),
      value: applyVariables(pair.value, variables)
    }));
  return buildRequestUrl(base, resolvedParams, hash);
}

export function redactRequestAuthForExport(auth: RequestAuth): RequestAuth {
  if (auth.type === "bearer") {
    return { type: "bearer", bearerToken: auth.bearerToken ? "***" : "" };
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      basicUsername: auth.basicUsername ?? "",
      basicPassword: auth.basicPassword ? "***" : ""
    };
  }
  if (auth.type === "apikey") {
    return {
      type: "apikey",
      apiKeyName: auth.apiKeyName ?? "",
      apiKeyValue: auth.apiKeyValue ? "***" : "",
      apiKeyIn: auth.apiKeyIn ?? "header"
    };
  }
  return defaultRequestAuth();
}

export function hydrateRequestAuth(request: SavedRequest): SavedRequest {
  const auth = normalizeRequestAuth(request.auth);
  if (auth.type !== "none") return { ...request, auth };
  const extracted = parseAuthFromHeaders(request.headers);
  return { ...request, auth: extracted.auth, headers: extracted.headers };
}

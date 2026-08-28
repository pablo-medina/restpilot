import { applyVariables } from "../lib/variables";
import { buildRequestUrl } from "../lib/url-params";
import { compactBase64, decodeBasicCredentials, encodeBasicCredentials } from "../lib/basic-auth";
import type { HeaderPair, Pair, ParameterAnswers, RequestAuth, SavedRequest, Variable } from "../types";

const AUTH_HEADER_NAME = "authorization";

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
      basicMode: auth?.basicMode === "token" ? "token" : "credentials",
      basicUsername: auth?.basicUsername ?? "",
      basicPassword: auth?.basicPassword ?? "",
      basicToken: auth?.basicToken ?? ""
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
    const token = compactBase64(basicMatch[1]!);
    const decoded = decodeBasicCredentials(token);
    if (decoded) {
      return {
        auth: {
          type: "basic",
          basicMode: "credentials",
          basicUsername: decoded.username,
          basicPassword: decoded.password,
          basicToken: token
        },
        headers: remaining
      };
    }
    // Not decodable as `user:password` (opaque or variable-driven) — keep it verbatim.
    return {
      auth: { type: "basic", basicMode: "token", basicUsername: "", basicPassword: "", basicToken: token },
      headers: remaining
    };
  }

  return { auth: defaultRequestAuth(), headers: remaining };
}

function headerPairsFromPairs(headers: Pair[], variables: Variable[], answers: ParameterAnswers): HeaderPair[] {
  return headers
    .filter((header) => header.enabled && header.key.trim())
    .map((header) => [
      applyVariables(header.key.trim(), variables, answers),
      applyVariables(header.value, variables, answers)
    ]);
}

/** Remove every pair whose key matches `name` case-insensitively (auth headers are singular). */
function withoutHeaderNamed(headers: HeaderPair[], name: string): HeaderPair[] {
  const needle = name.toLowerCase();
  return headers.filter(([key]) => key.toLowerCase() !== needle);
}

/**
 * Base64 credentials for `Authorization: Basic …`, whatever the input mode.
 * Token mode is passed through verbatim (already encoded); credential mode is encoded here.
 */
export function resolvedBasicCredentials(
  auth: RequestAuth,
  variables: Variable[],
  answers: ParameterAnswers = {}
): string {
  if (auth.basicMode === "token") {
    return compactBase64(applyVariables(auth.basicToken ?? "", variables, answers));
  }
  const username = applyVariables(auth.basicUsername ?? "", variables, answers);
  const password = applyVariables(auth.basicPassword ?? "", variables, answers);
  if (!username && !password) return "";
  return encodeBasicCredentials(username, password);
}

export function applyAuthHeaders(
  headers: HeaderPair[],
  auth: RequestAuth,
  variables: Variable[],
  answers: ParameterAnswers = {}
): HeaderPair[] {
  const next = withoutHeaderNamed(headers, AUTH_HEADER_NAME);

  if (auth.type === "bearer") {
    const token = applyVariables(auth.bearerToken ?? "", variables, answers).trim();
    if (token) next.push(["Authorization", `Bearer ${token}`]);
    return next;
  }

  if (auth.type === "basic") {
    const credentials = resolvedBasicCredentials(auth, variables, answers);
    if (credentials) next.push(["Authorization", `Basic ${credentials}`]);
    return next;
  }

  if (auth.type === "apikey" && auth.apiKeyIn !== "query") {
    const name = applyVariables(auth.apiKeyName ?? "", variables, answers).trim();
    const value = applyVariables(auth.apiKeyValue ?? "", variables, answers);
    if (name) {
      const withoutExisting = withoutHeaderNamed(next, name);
      withoutExisting.push([name, value]);
      return withoutExisting;
    }
  }

  return next;
}

export function mergeAuthQueryParams(
  params: Pair[],
  auth: RequestAuth,
  variables: Variable[],
  answers: ParameterAnswers = {}
): Pair[] {
  if (auth.type !== "apikey" || auth.apiKeyIn !== "query") {
    return params.map((pair) => ({ ...pair }));
  }

  const name = applyVariables(auth.apiKeyName ?? "", variables, answers).trim();
  if (!name) return params.map((pair) => ({ ...pair }));

  const value = applyVariables(auth.apiKeyValue ?? "", variables, answers);
  const withoutKey = params.filter((pair) => pair.key.trim() !== name);
  return [...withoutKey, { id: "auth-query", key: name, value, enabled: true }];
}

export function buildOutboundHeaders(
  request: SavedRequest,
  variables: Variable[],
  answers: ParameterAnswers = {}
): HeaderPair[] {
  const manual = headerPairsFromPairs(request.headers, variables, answers);
  return applyAuthHeaders(manual, normalizeRequestAuth(request.auth), variables, answers);
}

export function buildOutboundQueryParams(
  request: SavedRequest,
  variables: Variable[],
  answers: ParameterAnswers = {}
): Pair[] {
  const auth = normalizeRequestAuth(request.auth);
  if (auth.type !== "apikey" || auth.apiKeyIn !== "query") {
    return request.queryParams.map((pair) => ({ ...pair }));
  }
  return mergeAuthQueryParams(request.queryParams, auth, variables, answers);
}

export function requestAuthTextFields(request: SavedRequest): string[] {
  const auth = normalizeRequestAuth(request.auth);
  if (auth.type === "bearer") return [auth.bearerToken ?? ""];
  if (auth.type === "basic") {
    if (auth.basicMode === "token") return [auth.basicToken ?? ""];
    return [auth.basicUsername ?? "", auth.basicPassword ?? ""];
  }
  if (auth.type === "apikey") return [auth.apiKeyName ?? "", auth.apiKeyValue ?? ""];
  return [];
}

export function resolvedOutboundUrl(
  request: SavedRequest,
  variables: Variable[],
  answers: ParameterAnswers = {}
) {
  const params = buildOutboundQueryParams(request, variables, answers);
  const base = applyVariables(request.url.trim(), variables, answers);
  const hash = applyVariables(request.urlHash ?? "", variables, answers);
  const resolvedParams = params
    .filter((pair) => pair.enabled && pair.key.trim())
    .map((pair) => ({
      ...pair,
      key: applyVariables(pair.key, variables, answers),
      value: applyVariables(pair.value, variables, answers)
    }));
  return buildRequestUrl(base, resolvedParams, hash);
}

export function hydrateRequestAuth(request: SavedRequest): SavedRequest {
  const auth = normalizeRequestAuth(request.auth);
  if (auth.type !== "none") return { ...request, auth };
  const extracted = parseAuthFromHeaders(request.headers);
  return { ...request, auth: extracted.auth, headers: extracted.headers };
}

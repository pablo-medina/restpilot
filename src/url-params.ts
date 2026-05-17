import type { Pair, SavedRequest } from "./types";

export type UrlParts = {
  base: string;
  hash: string;
  params: { key: string; value: string }[];
};

export function splitUrl(raw: string): UrlParts {
  const trimmed = raw.trim();
  if (!trimmed) return { base: "", hash: "", params: [] };

  const hashIndex = trimmed.indexOf("#");
  let withoutHash = trimmed;
  let hash = "";
  if (hashIndex >= 0) {
    withoutHash = trimmed.slice(0, hashIndex);
    hash = trimmed.slice(hashIndex + 1);
  }

  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex < 0) return { base: withoutHash, hash, params: [] };

  const base = withoutHash.slice(0, queryIndex);
  const query = withoutHash.slice(queryIndex + 1);
  const params: { key: string; value: string }[] = [];
  const search = new URLSearchParams(query);
  search.forEach((value, key) => params.push({ key, value }));
  return { base, hash, params };
}

export function buildRequestUrl(base: string, params: Pair[], hash = ""): string {
  const trimmedBase = base.trim();
  const enabled = params.filter((pair) => pair.enabled && pair.key.trim());
  let url = trimmedBase;

  if (enabled.length) {
    const search = new URLSearchParams();
    for (const pair of enabled) {
      search.append(pair.key.trim(), pair.value);
    }
    const serialized = search.toString();
    if (serialized) url += `${url.includes("?") ? "&" : "?"}${serialized}`;
  }

  const trimmedHash = hash.trim();
  if (trimmedHash) url += `#${trimmedHash}`;
  return url;
}

export function pairsFromUrlParams(params: { key: string; value: string }[], id: () => string): Pair[] {
  return params.map((param) => ({
    id: id(),
    key: param.key,
    value: param.value,
    enabled: true
  }));
}

export function ingestUrlIntoRequest(request: SavedRequest, raw: string, id: () => string) {
  const split = splitUrl(raw);
  request.url = split.base;
  request.urlHash = split.hash;
  request.queryParams = pairsFromUrlParams(split.params, id);
}

export function migrateRequestQuery(request: SavedRequest & { queryParams?: Pair[]; urlHash?: string }): SavedRequest {
  const existing = request.queryParams;
  if (existing?.length) {
    return {
      ...request,
      urlHash: request.urlHash ?? "",
      queryParams: existing
    };
  }

  const hasQueryInUrl = (request.url ?? "").includes("?");
  if (!hasQueryInUrl && existing) {
    return {
      ...request,
      urlHash: request.urlHash ?? "",
      queryParams: existing
    };
  }

  const split = splitUrl(request.url ?? "");
  return {
    ...request,
    url: split.base,
    urlHash: split.hash,
    queryParams: split.params.map((param) => ({
      id: crypto.randomUUID(),
      key: param.key,
      value: param.value,
      enabled: true
    }))
  };
}

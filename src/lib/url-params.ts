import type { Pair, SavedRequest } from "../types";

export type UrlParts = {
  base: string;
  hash: string;
  params: { key: string; value: string }[];
};

/**
 * A `{{…}}` is opaque to URL syntax, the way Postman and Insomnia treat their own tokens: the
 * `?` in `{{?name}}` must not start the query string, and the braces must survive a
 * `URLSearchParams` round-trip without being percent-encoded. Swapping each template for an
 * unreserved placeholder before parsing or encoding, then swapping it back, gives both.
 */
/** The trailing alternative catches a template still being typed — `{{?num`, `{{?numPost}` — so
 * the `?` does not become query syntax before the closing braces arrive. */
const TEMPLATE_TOKEN = /\{\{[^{}]*\}\}|\{\{[^{}]*\}?$/g;
const PLACEHOLDER = /rpTpl(\d+)Rp/g;

function createTemplateMask() {
  const tokens: string[] = [];
  return {
    mask: (value: string) =>
      value.replace(TEMPLATE_TOKEN, (match) => {
        tokens.push(match);
        return `rpTpl${tokens.length - 1}Rp`;
      }),
    unmask: (value: string) =>
      tokens.length
        ? value.replace(PLACEHOLDER, (match, index: string) => tokens[Number(index)] ?? match)
        : value
  };
}

export function splitUrl(raw: string): UrlParts {
  const trimmed = raw.trim();
  if (!trimmed) return { base: "", hash: "", params: [] };

  const mask = createTemplateMask();
  const masked = mask.mask(trimmed);

  const hashIndex = masked.indexOf("#");
  let withoutHash = masked;
  let hash = "";
  if (hashIndex >= 0) {
    withoutHash = masked.slice(0, hashIndex);
    hash = masked.slice(hashIndex + 1);
  }

  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex < 0) return { base: mask.unmask(withoutHash), hash: mask.unmask(hash), params: [] };

  const base = withoutHash.slice(0, queryIndex);
  const query = withoutHash.slice(queryIndex + 1);
  const params: { key: string; value: string }[] = [];
  const search = new URLSearchParams(query);
  search.forEach((value, key) => params.push({ key: mask.unmask(key), value: mask.unmask(value) }));
  return { base: mask.unmask(base), hash: mask.unmask(hash), params };
}

/** `preserveTemplates` is for the URL the user is editing. The outbound URL leaves it off, so a
 * resolved value that happens to contain braces is still encoded. */
export function buildRequestUrl(base: string, params: Pair[], hash = "", preserveTemplates = false): string {
  const trimmedBase = base.trim();
  const enabled = params.filter((pair) => pair.enabled && pair.key.trim());
  let url = trimmedBase;

  if (enabled.length) {
    const mask = createTemplateMask();
    const keep = (value: string) => (preserveTemplates ? mask.mask(value) : value);
    const search = new URLSearchParams();
    for (const pair of enabled) {
      search.append(keep(pair.key.trim()), keep(pair.value));
    }
    const serialized = preserveTemplates ? mask.unmask(search.toString()) : search.toString();
    // Templates are stripped first: a `?` inside `{{?name}}` is not the start of a query string.
    const hasQuery = trimmedBase.replace(TEMPLATE_TOKEN, "").includes("?");
    if (serialized) url += `${hasQuery ? "&" : "?"}${serialized}`;
  }

  const trimmedHash = hash.trim();
  if (trimmedHash) url += `#${trimmedHash}`;
  return url;
}

function pairsFromUrlParams(params: { key: string; value: string }[], id: () => string): Pair[] {
  return params.map((param) => ({
    id: id(),
    key: param.key,
    value: param.value,
    enabled: true
  }));
}

export function ingestUrlIntoRequest(request: SavedRequest, raw: string, id: () => string) {
  const split = splitUrl(raw);
  const hashIndex = raw.indexOf("#");
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hasBareQuery = withoutHash.includes("?") && withoutHash.endsWith("?");

  request.url = split.params.length === 0 && hasBareQuery ? `${split.base}?` : split.base;
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

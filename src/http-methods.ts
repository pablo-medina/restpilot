export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "#22c55e",
  POST: "#3b82f6",
  PUT: "#f97316",
  PATCH: "#eab308",
  DELETE: "#ef4444",
  OPTIONS: "#a855f7",
  HEAD: "#06b6d4"
};

/** Slightly brighter variants for dark backgrounds. */
const METHOD_COLORS_DARK: Record<HttpMethod, string> = {
  GET: "#4ade80",
  POST: "#60a5fa",
  PUT: "#fb923c",
  PATCH: "#facc15",
  DELETE: "#f87171",
  OPTIONS: "#c084fc",
  HEAD: "#22d3ee"
};

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

export function methodColor(method: string, dark = false): string | null {
  if (!isHttpMethod(method)) return null;
  return dark ? METHOD_COLORS_DARK[method] : METHOD_COLORS[method];
}

export function methodDataAttribute(method: string): string {
  return isHttpMethod(method) ? ` data-method="${method}"` : "";
}

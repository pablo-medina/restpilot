import type { ProxyAuthMode, ProxySettings } from "../types";

type LegacyProxy = Partial<ProxySettings> & {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  authMode?: string;
  useCurlForSystem?: boolean;
  noProxy?: string;
};

/** Builds a proxy URL (`http(s)://user:pass@host:port`). */
export function buildProxyUrl(
  host: string,
  port: number,
  username: string,
  password: string,
  scheme: "http" | "https" = "http"
): string {
  const trimmed = host.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!trimmed) return "";

  const hasPort = /:\d+$/.test(trimmed);
  const authority = hasPort ? trimmed : `${trimmed}:${port}`;
  const user = username.trim();
  if (!user) {
    return `${scheme}://${authority}`;
  }
  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  return `${scheme}://${encUser}:${encPass}@${authority}`;
}

export function normalizeProxyAuthMode(value: unknown): ProxyAuthMode {
  if (value === "basic" || value === "ntlm" || value === "negotiate") return value;
  return "auto";
}

function normalizeNoProxy(value: unknown): string {
  if (typeof value !== "string") return "localhost,127.0.0.1";
  const trimmed = value.trim();
  return trimmed || "localhost,127.0.0.1";
}

export function normalizeProxySettings(proxy: LegacyProxy | undefined): ProxySettings {
  const rawMode = proxy?.mode;
  const mode: ProxySettings["mode"] =
    rawMode === "system" || rawMode === "environment" || rawMode === "manual" ? rawMode : "none";
  const authMode = normalizeProxyAuthMode(proxy?.authMode);
  const noProxy = normalizeNoProxy(proxy?.noProxy);
  const defaults: ProxySettings = {
    mode: "none",
    httpProxy: "",
    httpsProxy: "",
    noProxy: "localhost,127.0.0.1",
    useHttpProxyEnv: true,
    useHttpsProxyEnv: true,
    useNoProxyEnv: true,
    authMode: "auto"
  };

  if (!proxy) return defaults;

  const httpFromFields = (proxy.httpProxy ?? "").trim();
  const httpsFromFields = (proxy.httpsProxy ?? "").trim();
  if (httpFromFields || httpsFromFields) {
    return {
      mode,
      httpProxy: httpFromFields,
      httpsProxy: httpsFromFields,
      authMode,
      noProxy,
      useHttpProxyEnv: proxy.useHttpProxyEnv !== false,
      useHttpsProxyEnv: proxy.useHttpsProxyEnv !== false,
      useNoProxyEnv: proxy.useNoProxyEnv !== false
    };
  }

  // One-time migration from older host/port/user/pass fields still in config.json.
  const host = String(proxy.host ?? "").trim();
  if (!host) {
    return {
      mode,
      httpProxy: "",
      httpsProxy: "",
      authMode,
      noProxy,
      useHttpProxyEnv: proxy.useHttpProxyEnv !== false,
      useHttpsProxyEnv: proxy.useHttpsProxyEnv !== false,
      useNoProxyEnv: proxy.useNoProxyEnv !== false
    };
  }

  const port = typeof proxy.port === "number" && proxy.port > 0 ? proxy.port : 8080;
  const username = String(proxy.username ?? "");
  const password = String(proxy.password ?? "");
  return {
    mode,
    httpProxy: "",
    httpsProxy: buildProxyUrl(host, port, username, password, "http"),
    authMode,
    noProxy,
    useHttpProxyEnv: proxy.useHttpProxyEnv !== false,
    useHttpsProxyEnv: proxy.useHttpsProxyEnv !== false,
    useNoProxyEnv: proxy.useNoProxyEnv !== false
  };
}

/** When enabling a proxy source, default auth to automatic negotiation. */
export function proxyAuthModeForModeChange(mode: ProxySettings["mode"], current: ProxyAuthMode): ProxyAuthMode {
  if (mode === "system" || mode === "environment" || mode === "manual") return "auto";
  return current;
}

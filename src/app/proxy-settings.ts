import type { ProxyAuthMode, ProxySettings } from "../types";

type LegacyProxy = Partial<ProxySettings> & {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  authMode?: string;
  useCurlForSystem?: boolean;
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

export function normalizeProxySettings(proxy: LegacyProxy | undefined): ProxySettings {
  const mode = proxy?.mode ?? "none";
  const authMode = normalizeProxyAuthMode(proxy?.authMode);
  const useCurlForSystem = proxy?.useCurlForSystem === true;
  const defaults: ProxySettings = {
    mode: "none",
    httpProxy: "",
    httpsProxy: "",
    authMode: "auto",
    useCurlForSystem: false
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
      useCurlForSystem
    };
  }

  // One-time migration from older host/port/user/pass fields still in config.json.
  const host = String(proxy.host ?? "").trim();
  if (!host) {
    return { mode, httpProxy: "", httpsProxy: "", authMode, useCurlForSystem };
  }

  const port = typeof proxy.port === "number" && proxy.port > 0 ? proxy.port : 8080;
  const username = String(proxy.username ?? "");
  const password = String(proxy.password ?? "");
  return {
    mode,
    httpProxy: "",
    httpsProxy: buildProxyUrl(host, port, username, password, "http"),
    authMode,
    useCurlForSystem
  };
}

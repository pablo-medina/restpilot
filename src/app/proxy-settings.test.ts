import { describe, expect, it } from "vitest";
import { buildProxyUrl, normalizeProxyAuthMode, normalizeProxySettings } from "./proxy-settings";

describe("normalizeProxySettings", () => {
  it("migrates legacy host/port/credentials to http and https URLs", () => {
    const proxy = normalizeProxySettings({
      mode: "manual",
      host: "proxy.example.com",
      port: 8080,
      username: "user",
      password: "p@ss"
    });
    expect(proxy.httpProxy).toBe("");
    expect(proxy.httpsProxy).toBe("http://user:p%40ss@proxy.example.com:8080");
  });

  it("keeps explicit proxy URLs", () => {
    const proxy = normalizeProxySettings({
      mode: "manual",
      httpProxy: "http://a:1@p:99",
      httpsProxy: "https://b:2@p:99"
    });
    expect(proxy.httpProxy).toBe("http://a:1@p:99");
    expect(proxy.httpsProxy).toBe("https://b:2@p:99");
    expect(proxy.authMode).toBe("auto");
    expect(proxy.useCurlForSystem).toBe(false);
  });

  it("normalizes proxy auth mode", () => {
    expect(normalizeProxySettings({ mode: "manual", authMode: "ntlm" }).authMode).toBe("ntlm");
    expect(normalizeProxyAuthMode("bogus")).toBe("auto");
  });
});

describe("buildProxyUrl", () => {
  it("does not duplicate port when host already includes it", () => {
    expect(buildProxyUrl("proxy.example.com:8080", 3128, "", "")).toBe("http://proxy.example.com:8080");
  });
});

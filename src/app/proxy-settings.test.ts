import { describe, expect, it } from "vitest";
import {
  buildProxyUrl,
  normalizeProxyAuthMode,
  normalizeProxySettings,
  proxyAuthModeForModeChange
} from "./proxy-settings";

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
    expect(proxy.noProxy).toBe("localhost,127.0.0.1");
  });

  it("presets auth to auto when switching to a proxy source", () => {
    expect(proxyAuthModeForModeChange("system", "basic")).toBe("auto");
    expect(proxyAuthModeForModeChange("environment", "basic")).toBe("auto");
    expect(proxyAuthModeForModeChange("manual", "basic")).toBe("auto");
    expect(proxyAuthModeForModeChange("none", "basic")).toBe("basic");
  });

  it("normalizes proxy auth mode", () => {
    expect(normalizeProxySettings({ mode: "manual", authMode: "ntlm" }).authMode).toBe("ntlm");
    expect(normalizeProxyAuthMode("bogus")).toBe("auto");
  });

  it("keeps the environment mode and rejects unknown modes", () => {
    expect(normalizeProxySettings({ mode: "environment" }).mode).toBe("environment");
    expect(normalizeProxySettings({ mode: "invalid" as never }).mode).toBe("none");
  });

  it("enables all environment variables by default and preserves opt-outs", () => {
    const defaults = normalizeProxySettings({ mode: "environment" });
    expect(defaults.useHttpProxyEnv).toBe(true);
    expect(defaults.useHttpsProxyEnv).toBe(true);
    expect(defaults.useNoProxyEnv).toBe(true);

    const selective = normalizeProxySettings({
      mode: "environment",
      useHttpProxyEnv: false,
      useHttpsProxyEnv: true,
      useNoProxyEnv: false
    });
    expect(selective.useHttpProxyEnv).toBe(false);
    expect(selective.useHttpsProxyEnv).toBe(true);
    expect(selective.useNoProxyEnv).toBe(false);
  });
});

describe("buildProxyUrl", () => {
  it("does not duplicate port when host already includes it", () => {
    expect(buildProxyUrl("proxy.example.com:8080", 3128, "", "")).toBe("http://proxy.example.com:8080");
  });
});

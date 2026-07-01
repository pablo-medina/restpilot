//! Proxy connection test with step-by-step log (redacted).

use crate::{
    http_curl,
    proxy_env,
    proxy_windows,
    redact_proxy_url,
    ProxySettings, TestProxyResult,
};

pub struct ProxyTestLog {
    lines: Vec<String>,
}

impl ProxyTestLog {
    pub fn new() -> Self {
        Self { lines: Vec::new() }
    }

    pub fn push(&mut self, line: impl Into<String>) {
        self.lines.push(line.into());
    }

    pub fn into_lines(self) -> Vec<String> {
        self.lines
    }
}

pub fn log_proxy_plan(log: &mut ProxyTestLog, proxy: Option<&ProxySettings>, test_url: &str) {
    let mode = proxy.map(|value| value.mode.as_str()).unwrap_or("none");
    log.push(format!("Test URL: {test_url}"));
    log.push(format!("Proxy mode: {mode}"));

    if mode == "none" {
        log.push("Direct connection (no proxy).".to_string());
        return;
    }

    let auth = proxy
        .map(http_curl::proxy_auth_mode)
        .unwrap_or("auto");
    log.push(format!("Proxy authentication: {auth}"));

    if http_curl::should_use_curl(proxy) {
        log.push("HTTP engine: libcurl.".to_string());
        if !http_curl::curl_has_ntlm() && auth != "basic" {
            log.push("Warning: libcurl build without NTLM support.".to_string());
        }
    } else {
        log.push("HTTP engine: reqwest.".to_string());
    }

    let no_proxy = proxy_env::effective_no_proxy(proxy);
    if !no_proxy.is_empty() {
        log.push(format!("NO_PROXY: {no_proxy}"));
    }

    let Some(proxy) = proxy else { return };

    if proxy.mode == "manual" {
        let (http, https) = crate::manual_proxy_urls(proxy);
        if let Some(url) = http {
            log.push(format!("Manual HTTP proxy: {}", redact_proxy_url(&url)));
        }
        if let Some(url) = https {
            log.push(format!("Manual HTTPS proxy: {}", redact_proxy_url(&url)));
        }
    }

    if proxy.mode == "environment" {
        let (http, https) = http_curl::environment_proxy_urls(proxy);
        log.push(format!(
            "HTTP_PROXY: {}",
            if proxy.use_http_proxy_env { "enabled" } else { "disabled" }
        ));
        if let Some(url) = http {
            log.push(format!("HTTP_PROXY value: {}", redact_proxy_url(&url)));
        }
        log.push(format!(
            "HTTPS_PROXY: {}",
            if proxy.use_https_proxy_env { "enabled" } else { "disabled" }
        ));
        if let Some(url) = https {
            log.push(format!("HTTPS_PROXY value: {}", redact_proxy_url(&url)));
        }
        log.push(format!(
            "NO_PROXY: {}",
            if proxy.use_no_proxy_env { "enabled" } else { "disabled" }
        ));
        if let Some(resolved) = http_curl::resolve_proxy_url_for_target(proxy, test_url) {
            log.push(format!(
                "Resolved proxy for test URL: {}",
                redact_proxy_url(&resolved)
            ));
        } else {
            log.push("No enabled proxy environment variable is set for this URL.".to_string());
        }
    }

    if proxy.mode == "system" {
        log.push("Resolving system proxy (PAC / Windows settings / environment variables).".to_string());
        #[cfg(windows)]
        if let Some(detail) = crate::windows_proxy_detail() {
            log.push(detail);
        }
        #[cfg(windows)]
        if let Some(url) = proxy_windows::static_proxy_url() {
            log.push(format!(
                "Windows static proxy: {}",
                crate::redact_proxy_url(&url)
            ));
        }
        if let Ok(value) = std::env::var("HTTPS_PROXY").or_else(|_| std::env::var("https_proxy")) {
            if !value.trim().is_empty() {
                log.push(format!("HTTPS_PROXY: {}", redact_proxy_url(value.trim())));
            }
        }
        if let Ok(value) = std::env::var("HTTP_PROXY").or_else(|_| std::env::var("http_proxy")) {
            if !value.trim().is_empty() {
                log.push(format!("HTTP_PROXY: {}", redact_proxy_url(value.trim())));
            }
        }
        if let Some(resolved) = proxy_windows::resolve_proxy_for_url(test_url) {
            log.push(format!(
                "Resolved proxy for test URL: {}",
                redact_proxy_url(&resolved)
            ));
        } else if let Some(resolved) = http_curl::resolve_proxy_url_for_target(proxy, test_url) {
            log.push(format!(
                "Resolved proxy for test URL: {}",
                redact_proxy_url(&resolved)
            ));
        } else {
            log.push("No system proxy resolved for this URL.".to_string());
        }
    }
}

pub fn finish_result(
    mut log: ProxyTestLog,
    ok: bool,
    status: Option<u16>,
    duration_ms: u128,
    error: Option<String>,
    hint: Option<String>,
) -> TestProxyResult {
    if ok {
        log.push(format!(
            "Result: success (HTTP {}) in {duration_ms} ms.",
            status.unwrap_or(0)
        ));
    } else if let Some(message) = error.as_ref() {
        log.push(format!("Result: failed — {message}"));
        if let Some(hint) = hint.as_ref() {
            log.push(format!("Hint: {hint}"));
        }
    }
    TestProxyResult {
        ok,
        status,
        duration_ms,
        error,
        hint,
        detail: None,
        log: log.into_lines(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_plan_does_not_include_raw_credentials() {
        let proxy = crate::ProxySettings {
            mode: "manual".to_string(),
            http_proxy: Some("http://secret:pass@proxy.corp:8080".to_string()),
            https_proxy: None,
            host: None,
            port: None,
            username: None,
            password: None,
            auth_mode: Some("auto".to_string()),
            no_proxy: Some("localhost".to_string()),
            use_http_proxy_env: true,
            use_https_proxy_env: true,
            use_no_proxy_env: true,
        };
        let mut log = ProxyTestLog::new();
        log_proxy_plan(&mut log, Some(&proxy), "https://example.com/");
        let joined = log.into_lines().join("\n");
        assert!(!joined.contains("secret"));
        assert!(!joined.contains("pass@"));
        assert!(joined.contains("***@"));
    }
}

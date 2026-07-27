use std::{collections::HashSet, fs, path::PathBuf, sync::Mutex, time::Instant};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::StreamExt;
use reqwest::{header::HeaderMap, Method};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tokio::time::{sleep, timeout, Duration};

mod http_curl;
mod http_errors;
mod proxy_env;
mod proxy_test;
mod proxy_uri;
mod proxy_windows;

const STREAM_EVENT: &str = "restpilot:request-stream";

#[derive(Default)]
struct RuntimeState {
    cancellations: Mutex<HashSet<String>>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ProxySettings {
    mode: String,
    #[serde(default)]
    http_proxy: Option<String>,
    #[serde(default)]
    https_proxy: Option<String>,
    // Legacy (migrated from older configs).
    #[serde(default)]
    host: Option<String>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    /// `auto` | `basic` | `ntlm` | `negotiate` — auto uses libcurl to negotiate on 407.
    #[serde(default)]
    auth_mode: Option<String>,
    /// Comma-separated hosts bypassing the proxy (e.g. localhost,127.0.0.1).
    #[serde(default)]
    no_proxy: Option<String>,
    #[serde(default = "default_true")]
    use_http_proxy_env: bool,
    #[serde(default = "default_true")]
    use_https_proxy_env: bool,
    #[serde(default = "default_true")]
    use_no_proxy_env: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct NetworkSettings {
    timeout_secs: Option<u64>,
    follow_redirects: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct SendRequestPayload {
    request: RestRequest,
    proxy: Option<ProxySettings>,
    network: Option<NetworkSettings>,
}

#[derive(Debug, Clone, Deserialize)]
struct RestRequest {
    id: String,
    method: String,
    url: String,
    /// Ordered `(name, value)` pairs — a list, not a map, so repeated header
    /// names (e.g. two `Accept` values) are all sent instead of collapsing.
    headers: Vec<(String, String)>,
    body_mode: String,
    body: String,
    form: Vec<FormPair>,
    stream: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct FormPair {
    key: String,
    value: String,
    enabled: bool,
    #[serde(default)]
    part_type: Option<String>,
    #[serde(default)]
    file_name: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct StreamEvent {
    request_id: String,
    chunk: String,
    done: bool,
    status: Option<u16>,
    status_text: Option<String>,
    headers: Option<Vec<(String, String)>>,
    duration_ms: Option<u128>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct RestResponse {
    status: u16,
    status_text: String,
    duration_ms: u128,
    /// Ordered `(name, value)` pairs — repeated header names (e.g. multiple
    /// `Set-Cookie`) are preserved instead of collapsing to the last one.
    headers: Vec<(String, String)>,
    /// UTF-8 text as-is, or base64 when `body_is_base64` is true.
    body: String,
    /// True when `body` holds base64-encoded bytes (the response was not
    /// valid UTF-8 — images, PDFs, protobuf, etc). Streaming responses are
    /// always decoded as lossy UTF-8 and never set this flag.
    body_is_base64: bool,
    /// Real byte length of the response body, independent of `body`'s
    /// encoding (JS string length is wrong for base64 and for multi-byte
    /// UTF-8 text).
    body_size: u64,
}

#[derive(Debug, Serialize)]
struct StartupSettings {
    theme: String,
    language: String,
}

#[tauri::command]
fn load_startup_settings() -> StartupSettings {
    let defaults = StartupSettings {
        theme: "light".to_string(),
        language: "en".to_string(),
    };

    let Ok(path) = config_file_path() else {
        return defaults;
    };
    if !path.exists() {
        return defaults;
    }

    let Ok(content) = fs::read_to_string(path) else {
        return defaults;
    };
    let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) else {
        return defaults;
    };

    let settings = config.get("settings");
    StartupSettings {
        theme: settings
            .and_then(|value| value.get("theme"))
            .and_then(|value| value.as_str())
            .filter(|value| *value == "light" || *value == "dark")
            .unwrap_or(defaults.theme.as_str())
            .to_string(),
        language: settings
            .and_then(|value| value.get("language"))
            .and_then(|value| value.as_str())
            .filter(|value| *value == "en" || *value == "es")
            .unwrap_or(defaults.language.as_str())
            .to_string(),
    }
}

#[tauri::command]
fn load_app_config() -> Result<serde_json::Value, String> {
    let path = config_file_path()?;
    if !path.exists() {
        return Ok(serde_json::Value::Null);
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_app_config(config: serde_json::Value) -> Result<(), String> {
    let path = config_file_path()?;
    let dir = path
        .parent()
        .ok_or_else(|| "Could not resolve config directory.".to_string())?;

    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let content = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

/// Response bodies/history live in their own file, sibling to `config.json`,
/// so a handful of large saved responses don't bloat the settings file that
/// gets rewritten on every collection edit.
fn response_cache_file_path() -> Result<PathBuf, String> {
    let mut path = config_file_path()?;
    path.set_file_name("responses.json");
    Ok(path)
}

#[tauri::command]
fn load_response_cache() -> Result<serde_json::Value, String> {
    let path = response_cache_file_path()?;
    if !path.exists() {
        return Ok(serde_json::Value::Null);
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_response_cache(cache: serde_json::Value) -> Result<(), String> {
    let path = response_cache_file_path()?;
    let dir = path
        .parent()
        .ok_or_else(|| "Could not resolve response cache directory.".to_string())?;

    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let content = serde_json::to_string_pretty(&cache).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_request(state: tauri::State<RuntimeState>, id: String) -> Result<(), String> {
    state
        .cancellations
        .lock()
        .map_err(|_| "Cancellation state is unavailable.".to_string())?
        .insert(id);
    Ok(())
}

#[tauri::command]
async fn send_request(
    app: tauri::AppHandle,
    state: tauri::State<'_, RuntimeState>,
    payload: SendRequestPayload,
) -> Result<RestResponse, String> {
    state
        .cancellations
        .lock()
        .map_err(|_| "Cancellation state is unavailable.".to_string())?
        .remove(&payload.request.id);

    if payload.request.stream {
        let app = app.clone();
        let request = payload.request;
        let proxy = payload.proxy;
        let request_id = request.id.clone();
        let error_request_id = request_id.clone();

        let network = payload.network;

        tauri::async_runtime::spawn(async move {
            let state = app.state::<RuntimeState>();
            let result = tokio::select! {
                result = execute_request(app.clone(), state.inner(), request, proxy, network) => result,
                _ = wait_for_cancel(state.inner(), request_id) => Err("Request cancelled.".to_string()),
            };

            if let Err(error) = result {
                let _ = emit_stream(
                    &app,
                    StreamEvent {
                        request_id: error_request_id,
                        chunk: String::new(),
                        done: true,
                        status: None,
                        status_text: None,
                        headers: None,
                        duration_ms: None,
                        error: Some(error),
                    },
                );
            }
        });

        return Ok(RestResponse {
            status: 0,
            status_text: String::new(),
            duration_ms: 0,
            headers: Vec::new(),
            body: String::new(),
            body_is_base64: false,
            body_size: 0,
        });
    }

    let request_id = payload.request.id.clone();
    let request_future = execute_request(
        app,
        state.inner(),
        payload.request,
        payload.proxy,
        payload.network,
    );
    let cancel_future = wait_for_cancel(state.inner(), request_id);

    tokio::select! {
        result = request_future => result,
        _ = cancel_future => Err("Request cancelled.".to_string()),
    }
}

fn legacy_proxy_urls(proxy: &ProxySettings) -> (Option<String>, Option<String>) {
    let host = proxy.host.as_deref().unwrap_or("").trim();
    if host.is_empty() {
        return (None, None);
    }
    let port = proxy.port.unwrap_or(8080);
    let host_only = host
        .strip_prefix("http://")
        .or_else(|| host.strip_prefix("https://"))
        .unwrap_or(host)
        .trim_end_matches('/');
    if host_only.is_empty() {
        return (None, None);
    }
    let authority = if host_only.contains(':') {
        host_only.to_string()
    } else {
        format!("{host_only}:{port}")
    };
    let user = proxy.username.as_deref().unwrap_or("").trim();
    let pass = proxy.password.as_deref().unwrap_or("");
    let creds = if user.is_empty() {
        String::new()
    } else {
        format!(
            "{}:{}@",
            urlencoding::encode(user),
            urlencoding::encode(pass)
        )
    };
    (
        Some(format!("http://{creds}{authority}")),
        Some(format!("https://{creds}{authority}")),
    )
}

pub(crate) fn manual_proxy_urls(proxy: &ProxySettings) -> (Option<String>, Option<String>) {
    let http = proxy
        .http_proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let https = proxy
        .https_proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if http.is_some() || https.is_some() {
        return (http, https);
    }
    legacy_proxy_urls(proxy)
}

fn build_reqwest_proxy(parsed: &proxy_uri::ParsedProxy, for_https: bool, use_all: bool) -> Result<reqwest::Proxy, String> {
    let mut proxy = if use_all {
        reqwest::Proxy::all(&parsed.endpoint)
    } else if for_https {
        reqwest::Proxy::https(&parsed.endpoint)
    } else {
        reqwest::Proxy::http(&parsed.endpoint)
    }
    .map_err(|error| error.to_string())?;

    if !parsed.username.is_empty() {
        proxy = proxy.basic_auth(&parsed.username, &parsed.password);
    }

    Ok(proxy)
}

fn reqwest_proxy_from_url(raw: &str, for_https: bool) -> Result<reqwest::Proxy, String> {
    let parsed = proxy_uri::parse_proxy(raw)?;
    build_reqwest_proxy(&parsed, for_https, false)
}

fn apply_manual_proxies(
    builder: reqwest::ClientBuilder,
    proxy: &ProxySettings,
) -> Result<reqwest::ClientBuilder, String> {
    let (http, https) = manual_proxy_urls(proxy);
    if http.is_none() && https.is_none() {
        return Err("At least one proxy URL is required (HTTP and/or HTTPS).".to_string());
    }

    if http.is_none() {
        if let Some(url) = https {
            let parsed = proxy_uri::parse_proxy(&url)?;
            return Ok(builder.proxy(build_reqwest_proxy(&parsed, true, true)?));
        }
    }
    if https.is_none() {
        if let Some(url) = http {
            let parsed = proxy_uri::parse_proxy(&url)?;
            return Ok(builder.proxy(build_reqwest_proxy(&parsed, false, true)?));
        }
    }

    let mut builder = builder;
    if let Some(url) = http {
        builder = builder.proxy(reqwest_proxy_from_url(&url, false)?);
    }
    if let Some(url) = https {
        builder = builder.proxy(reqwest_proxy_from_url(&url, true)?);
    }
    Ok(builder)
}

async fn tcp_probe_proxy(raw: &str) -> Option<String> {
    let uri = proxy_uri::proxy_connect_uri(raw).ok()?;
    let parsed = reqwest::Url::parse(&uri).ok()?;
    let host = parsed.host_str()?;
    let port = parsed.port()?;
    match timeout(Duration::from_secs(5), tokio::net::TcpStream::connect((host, port))).await {
        Ok(Ok(_)) => Some(format!("TCP {host}:{port}: reachable")),
        Ok(Err(error)) => Some(format!("TCP {host}:{port}: {error}")),
        Err(_) => Some(format!("TCP {host}:{port}: timeout")),
    }
}

pub(crate) fn build_http_client(
    proxy: Option<ProxySettings>,
    follow_redirects: bool,
    target_url: Option<&str>,
) -> Result<reqwest::Client, String> {
    let no_proxy = proxy_env::effective_no_proxy(proxy.as_ref());
    proxy_env::with_no_proxy(&no_proxy, || build_http_client_inner(proxy, follow_redirects, target_url))
}

fn build_http_client_inner(
    proxy: Option<ProxySettings>,
    follow_redirects: bool,
    target_url: Option<&str>,
) -> Result<reqwest::Client, String> {
    let redirect = if follow_redirects {
        reqwest::redirect::Policy::limited(10)
    } else {
        reqwest::redirect::Policy::none()
    };
    let mut builder = reqwest::Client::builder()
        .redirect(redirect)
        .http1_only();

    let mode = proxy
        .as_ref()
        .map(|value| value.mode.as_str())
        .unwrap_or("none");

    match mode {
        "none" => {
            builder = builder.no_proxy();
        }
        "manual" => {
            let Some(proxy) = proxy.as_ref() else {
                return Err("Manual proxy settings are required.".to_string());
            };
            builder = apply_manual_proxies(builder, proxy)?;
        }
        "environment" => {
            let Some(proxy) = proxy.as_ref() else {
                return Err("Environment proxy settings are required.".to_string());
            };
            let Some(url) = target_url else {
                return Err("A target URL is required for environment proxy resolution.".to_string());
            };
            let resolved = http_curl::resolve_proxy_url_for_target(proxy, url).ok_or_else(|| {
                "No enabled proxy environment variable contains a proxy URL.".to_string()
            })?;
            let for_https = url.trim().to_ascii_lowercase().starts_with("https://");
            builder = builder.proxy(reqwest_proxy_from_url(resolved.trim(), for_https)?);
        }
        "system" => {
            if let (Some(proxy), Some(url)) = (proxy.as_ref(), target_url) {
                if let Some(resolved) = http_curl::resolve_proxy_url_for_target(proxy, url) {
                    let for_https = url.trim().to_ascii_lowercase().starts_with("https://");
                    let proxy_builder = reqwest_proxy_from_url(resolved.trim(), for_https)?;
                    builder = builder.proxy(proxy_builder);
                }
            }
        }
        _ => {
            builder = builder.no_proxy();
        }
    }

    builder.build().map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
struct TestProxyPayload {
    proxy: Option<ProxySettings>,
    url: Option<String>,
    timeout_secs: Option<u64>,
}

#[derive(Debug, Serialize)]
struct TestProxyResult {
    ok: bool,
    status: Option<u16>,
    duration_ms: u128,
    error: Option<String>,
    hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    #[serde(default)]
    log: Vec<String>,
}

const DEFAULT_PROXY_TEST_URL: &str = "https://jsonplaceholder.typicode.com/posts/1";

#[cfg(windows)]
fn windows_proxy_detail() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
        .ok()?;

    let enabled: u32 = settings.get_value("ProxyEnable").unwrap_or(0);
    if enabled == 1 {
        let server: String = settings.get_value("ProxyServer").unwrap_or_default();
        if !server.trim().is_empty() {
            return Some(format!(
                "Windows proxy enabled: {}",
                redact_proxy_url(&format!("http://{}", server.trim()))
            ));
        }
    }

    if let Ok(pac) = settings.get_value::<String, _>("AutoConfigURL") {
        if !pac.trim().is_empty() {
            return Some("Windows PAC script configured.".to_string());
        }
    }

    if enabled == 0 {
        return Some("Windows proxy disabled in Internet Settings.".to_string());
    }

    None
}

#[cfg(not(windows))]
fn windows_proxy_detail() -> Option<String> {
    None
}

fn redact_proxy_url(url: &str) -> String {
    let Ok(mut parsed) = reqwest::Url::parse(url) else {
        return url.to_string();
    };
    if parsed.username().is_empty() {
        return url.to_string();
    }
    let _ = parsed.set_username("");
    let _ = parsed.set_password(None);
    if let Some(host) = parsed.host_str() {
        let port = parsed.port().map(|value| format!(":{value}")).unwrap_or_default();
        return format!("{}://***@{host}{port}", parsed.scheme());
    }
    url.to_string()
}

#[tauri::command]
async fn test_proxy_connection(payload: TestProxyPayload) -> TestProxyResult {
    let url = payload
        .url
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_PROXY_TEST_URL.to_string());
    let timeout_secs = payload.timeout_secs.unwrap_or(30).clamp(5, 120);
    let url_trimmed = url.trim().to_string();
    let started = Instant::now();

    let mut log = proxy_test::ProxyTestLog::new();
    proxy_test::log_proxy_plan(&mut log, payload.proxy.as_ref(), &url_trimmed);
    log.push("Sending test request.".to_string());

    if let Some(proxy) = payload.proxy.as_ref() {
        if proxy.mode == "manual" || proxy.mode == "environment" {
            let proxy_url = if proxy.mode == "manual" {
                let (http, https) = manual_proxy_urls(proxy);
                https.or(http)
            } else {
                http_curl::resolve_proxy_url_for_target(proxy, &url_trimmed)
            };
            if let Some(proxy_url) = proxy_url {
                if let Some(tcp) = tcp_probe_proxy(&proxy_url).await {
                    log.push(tcp);
                }
            }
        }
    }

    if http_curl::should_use_curl(payload.proxy.as_ref()) {
        if let Err(message) = http_curl::ensure_curl_ntlm() {
            return proxy_test::finish_result(
                log,
                false,
                None,
                started.elapsed().as_millis(),
                Some(message),
                Some("Install the latest RestPilot build.".to_string()),
            );
        }
        let proxy = payload.proxy.clone();
        let auth_mode = payload
            .proxy
            .as_ref()
            .map(http_curl::proxy_auth_mode)
            .unwrap_or("auto")
            .to_string();
        let result = tokio::task::spawn_blocking(move || {
            http_curl::curl_get(&url_trimmed, proxy.as_ref(), true, timeout_secs)
        })
        .await;

        return match result {
            Ok(Ok((status, duration_ms))) => {
                let (error, hint) = if (200..300).contains(&status) {
                    (None, None)
                } else {
                    let (message, hint) = http_errors::describe_status(
                        reqwest::StatusCode::from_u16(status)
                            .unwrap_or(reqwest::StatusCode::BAD_GATEWAY),
                    );
                    (Some(message), hint)
                };
                proxy_test::finish_result(
                    log,
                    (200..300).contains(&status),
                    Some(status),
                    duration_ms,
                    error,
                    hint,
                )
            }
            Ok(Err(message)) => proxy_test::finish_result(
                log,
                false,
                None,
                started.elapsed().as_millis(),
                Some(http_errors::describe_curl_error(&message)),
                http_errors::curl_error_hint(&message, &auth_mode),
            ),
            Err(join_error) => proxy_test::finish_result(
                log,
                false,
                None,
                started.elapsed().as_millis(),
                Some(join_error.to_string()),
                None,
            ),
        };
    }

    let client = match build_http_client(payload.proxy.clone(), true, Some(url_trimmed.as_str())) {
        Ok(client) => client,
        Err(error) => {
            return proxy_test::finish_result(
                log,
                false,
                None,
                started.elapsed().as_millis(),
                Some(error),
                Some(
                    "Check proxy mode and URLs in settings (HTTPS proxy is enough for https:// targets)."
                        .to_string(),
                ),
            );
        }
    };

    match timeout(
        Duration::from_secs(timeout_secs),
        client.get(url_trimmed.as_str()).send(),
    )
    .await
    {
        Ok(Ok(response)) => {
            let status = response.status();
            let (error, hint) = if status.is_success() {
                (None, None)
            } else {
                let (message, hint) = http_errors::describe_status(status);
                (Some(message), hint)
            };
            proxy_test::finish_result(
                log,
                status.is_success(),
                Some(status.as_u16()),
                started.elapsed().as_millis(),
                error,
                hint,
            )
        }
        Ok(Err(error)) => {
            let (message, hint) = http_errors::describe_http_error(&error);
            proxy_test::finish_result(
                log,
                false,
                error.status().map(|value| value.as_u16()),
                started.elapsed().as_millis(),
                Some(message),
                hint,
            )
        }
        Err(_) => proxy_test::finish_result(
            log,
            false,
            None,
            started.elapsed().as_millis(),
            Some(format!("Timed out after {timeout_secs} seconds.")),
            Some(
                "The proxy or server did not respond in time. Try a higher timeout in settings."
                    .to_string(),
            ),
        ),
    }
}

/// `HeaderMap::iter()` yields one entry per value, so a response with two
/// `Set-Cookie` headers produces two pairs here instead of collapsing them.
fn collect_headers(response: &reqwest::Response) -> Vec<(String, String)> {
    response
        .headers()
        .iter()
        .map(|(key, value)| {
            (
                key.as_str().to_string(),
                value.to_str().unwrap_or("<binary>").to_string(),
            )
        })
        .collect()
}

/// Decode a response body for the frontend: valid UTF-8 stays as text;
/// anything else (images, PDFs, protobuf, ...) is base64-encoded instead of
/// being mangled through a lossy UTF-8 conversion. Returns `(body, is_base64,
/// byte_size)` — `byte_size` is always the real byte count, unlike `body.len()`
/// which would be the base64-inflated length when `is_base64` is true.
fn decode_response_body(bytes: &[u8]) -> (String, bool, u64) {
    let byte_size = bytes.len() as u64;
    match String::from_utf8(bytes.to_vec()) {
        Ok(text) => (text, false, byte_size),
        Err(error) => (BASE64.encode(error.into_bytes()), true, byte_size),
    }
}

#[cfg(test)]
mod response_body_tests {
    use super::decode_response_body;
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

    #[test]
    fn keeps_valid_utf8_as_text() {
        let (body, is_base64, size) = decode_response_body(r#"{"ok":true}"#.as_bytes());
        assert_eq!(body, r#"{"ok":true}"#);
        assert!(!is_base64);
        assert_eq!(size, 11);
    }

    #[test]
    fn base64_encodes_invalid_utf8_without_losing_bytes() {
        // 0xFF is never valid as a UTF-8 lead byte.
        let bytes: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        let (body, is_base64, size) = decode_response_body(bytes);
        assert!(is_base64);
        assert_eq!(size, bytes.len() as u64);
        assert_eq!(BASE64.decode(body).unwrap(), bytes);
    }

    #[test]
    fn reports_real_byte_length_for_multibyte_text() {
        // "café" is 4 chars but 5 bytes in UTF-8 (é = 2 bytes).
        let (_, is_base64, size) = decode_response_body("café".as_bytes());
        assert!(!is_base64);
        assert_eq!(size, 5);
    }
}

fn is_cancelled(state: &RuntimeState, request_id: &str) -> bool {
    state
        .cancellations
        .lock()
        .map(|cancellations| cancellations.contains(request_id))
        .unwrap_or(false)
}

fn emit_stream(app: &tauri::AppHandle, event: StreamEvent) -> Result<(), String> {
    app.emit(STREAM_EVENT, event)
        .map_err(|error| error.to_string())
}

fn apply_body(
    builder: reqwest::RequestBuilder,
    method: &Method,
    request: &RestRequest,
) -> Result<reqwest::RequestBuilder, String> {
    if *method == Method::GET || *method == Method::HEAD {
        return Ok(builder);
    }

    let body_mode = normalize_body_mode(&request.body_mode);

    match body_mode.as_str() {
        "form" => {
            let form = request
                .form
                .iter()
                .filter(|field| field.enabled && !field.key.trim().is_empty())
                .filter(|field| field.part_type.as_deref() != Some("file"))
                .map(|field| (field.key.clone(), field.value.clone()))
                .collect::<Vec<_>>();
            Ok(builder.form(&form))
        }
        "multipart" | "node" => {
            let mut multipart_form = reqwest::multipart::Form::new();
            for field in &request.form {
                if !field.enabled || field.key.trim().is_empty() {
                    continue;
                }
                if field.part_type.as_deref() == Some("file") {
                    if field.value.is_empty() {
                        continue;
                    }
                    let bytes = BASE64
                        .decode(field.value.trim())
                        .map_err(|error| error.to_string())?;
                    let file_name = field
                        .file_name
                        .clone()
                        .filter(|name| !name.is_empty())
                        .unwrap_or_else(|| "file".to_string());
                    let part = reqwest::multipart::Part::bytes(bytes)
                        .file_name(file_name)
                        .mime_str("application/octet-stream")
                        .map_err(|error| error.to_string())?;
                    multipart_form = multipart_form.part(field.key.clone(), part);
                } else {
                    multipart_form = multipart_form.text(field.key.clone(), field.value.clone());
                }
            }
            Ok(builder.multipart(multipart_form))
        }
        "none" => Ok(builder),
        "binary" => {
            if request.body.is_empty() {
                Ok(builder)
            } else {
                let bytes = BASE64
                    .decode(request.body.trim())
                    .map_err(|error| error.to_string())?;
                Ok(builder.body(bytes))
            }
        }
        _ => {
            if request.body.is_empty() {
                Ok(builder)
            } else {
                Ok(builder.body(request.body.clone()))
            }
        }
    }
}

fn normalize_body_mode(mode: &str) -> String {
    match mode {
        "node" => "multipart".to_string(),
        other => other.to_string(),
    }
}

async fn execute_request(
    app: tauri::AppHandle,
    state: &RuntimeState,
    request: RestRequest,
    proxy: Option<ProxySettings>,
    network: Option<NetworkSettings>,
) -> Result<RestResponse, String> {
    let follow_redirects = network.as_ref().and_then(|n| n.follow_redirects).unwrap_or(true);
    let timeout_secs = network
        .as_ref()
        .and_then(|n| n.timeout_secs)
        .unwrap_or(if request.stream { 600 } else { 60 })
        .clamp(5, 3600);

    if http_curl::should_use_curl(proxy.as_ref()) {
        let app_for_curl = if request.stream { Some(app.clone()) } else { None };
        let request_owned = request.clone();
        let proxy_owned = proxy.clone();
        return tokio::task::spawn_blocking(move || {
            http_curl::execute_request_curl_sync(
                app_for_curl,
                &request_owned,
                proxy_owned.as_ref(),
                follow_redirects,
                timeout_secs,
            )
        })
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| {
            let auth = proxy
                .as_ref()
                .map(http_curl::proxy_auth_mode)
                .unwrap_or("auto");
            if let Some(hint) = http_errors::curl_error_hint(&error, auth) {
                format!("{error} {hint}")
            } else {
                error
            }
        });
    }

    let method = request
        .method
        .parse::<Method>()
        .map_err(|_| format!("Unsupported HTTP method: {}", request.method))?;

    let client = build_http_client(proxy, follow_redirects, Some(request.url.as_str()))?;
    let request_id = request.id.clone();
    let stream = request.stream;

    let mut builder = client.request(method.clone(), request.url.clone());
    let mut headers = HeaderMap::new();

    let is_multipart = normalize_body_mode(&request.body_mode) == "multipart";

    for (key, value) in &request.headers {
        if is_multipart && key.to_ascii_lowercase() == "content-type" {
            continue;
        }
        let name = key
            .parse::<reqwest::header::HeaderName>()
            .map_err(|_| format!("Invalid header name: {}", key))?;
        let value = value
            .parse::<reqwest::header::HeaderValue>()
            .map_err(|_| format!("Invalid value for header: {}", key))?;
        // `append`, not `insert`: a request can legitimately repeat a header
        // name (e.g. two `Accept` values) and both must reach the server.
        headers.append(name, value);
    }

    builder = builder.headers(headers);
    builder = apply_body(builder, &method, &request)?;

    let started = Instant::now();
    let response = timeout(Duration::from_secs(timeout_secs), builder.send())
        .await
        .map_err(|_| format!("Request timed out after {timeout_secs} seconds."))?
        .map_err(|error| http_errors::describe_http_error(&error).0)?;

    let status = response.status();
    let status_code = status.as_u16();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let headers_map = collect_headers(&response);

    if stream {
        let mut body = String::new();
        emit_stream(
            &app,
            StreamEvent {
                request_id: request_id.clone(),
                chunk: String::new(),
                done: false,
                status: Some(status_code),
                status_text: Some(status_text.clone()),
                headers: Some(headers_map.clone()),
                duration_ms: None,
                error: None,
            },
        )?;

        let mut byte_stream = response.bytes_stream();
        while let Some(chunk) = byte_stream.next().await {
            if is_cancelled(state, &request_id) {
                return Err("Request cancelled.".to_string());
            }
            let chunk = chunk.map_err(|error| error.to_string())?;
            let text = String::from_utf8_lossy(&chunk);
            body.push_str(&text);
            emit_stream(
                &app,
                StreamEvent {
                    request_id: request_id.clone(),
                    chunk: text.into_owned(),
                    done: false,
                    status: None,
                    status_text: None,
                    headers: None,
                    duration_ms: None,
                    error: None,
                },
            )?;
        }

        let duration_ms = started.elapsed().as_millis();
        emit_stream(
            &app,
            StreamEvent {
                request_id: request_id.clone(),
                chunk: String::new(),
                done: true,
                status: Some(status_code),
                status_text: Some(status_text.clone()),
                headers: Some(headers_map.clone()),
                duration_ms: Some(duration_ms),
                error: None,
            },
        )?;

        // Streaming responses are always decoded as lossy UTF-8 chunk by
        // chunk (SSE/NDJSON use cases); binary-safe decoding only applies
        // to the buffered, non-streaming path below.
        let body_size = body.len() as u64;
        return Ok(RestResponse {
            status: status_code,
            status_text,
            duration_ms,
            headers: headers_map,
            body,
            body_is_base64: false,
            body_size,
        });
    }

    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let (body, body_is_base64, body_size) = decode_response_body(&bytes);

    Ok(RestResponse {
        status: status_code,
        status_text,
        duration_ms: started.elapsed().as_millis(),
        headers: headers_map,
        body,
        body_is_base64,
        body_size,
    })
}

async fn wait_for_cancel(state: &RuntimeState, request_id: String) {
    loop {
        let cancelled = state
            .cancellations
            .lock()
            .map(|mut cancellations| cancellations.remove(&request_id))
            .unwrap_or(false);

        if cancelled {
            return;
        }

        sleep(Duration::from_millis(80)).await;
    }
}

fn config_file_path() -> Result<PathBuf, String> {
    let mut dir = dirs::config_dir()
        .or_else(dirs::data_local_dir)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    dir.push("RestPilot");
    dir.push("config.json");
    Ok(dir)
}

fn maximize_on_startup_enabled() -> bool {
    let Ok(path) = config_file_path() else {
        return true;
    };
    if !path.exists() {
        return true;
    }

    let Ok(content) = fs::read_to_string(path) else {
        return true;
    };
    let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) else {
        return true;
    };

    config
        .get("settings")
        .and_then(|settings| settings.get("maximizeOnStartup"))
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

#[cfg(test)]
mod curl_build_tests {
    #[test]
    fn libcurl_includes_ntlm() {
        assert!(
            crate::http_curl::curl_has_ntlm(),
            "libcurl must be built with static-curl + ntlm"
        );
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(&["/C", "start", "", &url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg(&url)
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn();
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(RuntimeState::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("RestPilot");
                if maximize_on_startup_enabled() {
                    let _ = window.maximize();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cancel_request,
            load_startup_settings,
            load_app_config,
            save_app_config,
            load_response_cache,
            save_response_cache,
            send_request,
            test_proxy_connection,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running RestPilot");
}

//! HTTP via libcurl — proxy auth negotiation (Basic / NTLM / SPNEGO) like Insomnia.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use curl::easy::{Auth, Easy, List};
use reqwest::Method;
use tauri::{AppHandle, Emitter};

use crate::{proxy_env, proxy_uri, proxy_windows, ProxySettings, RestRequest, RestResponse, StreamEvent};

const STREAM_EVENT: &str = "restpilot:request-stream";

pub fn curl_has_ntlm() -> bool {
    curl::Version::get().feature_ntlm()
}

pub fn ensure_curl_ntlm() -> Result<(), String> {
    if curl_has_ntlm() {
        Ok(())
    } else {
        Err("NTLM is not available in this build.".to_string())
    }
}

pub fn proxy_auth_mode(proxy: &ProxySettings) -> &str {
    proxy
        .auth_mode
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or("auto")
}

pub fn should_use_curl(proxy: Option<&ProxySettings>) -> bool {
    let Some(proxy) = proxy else {
        return false;
    };
    if proxy.mode == "none" {
        return false;
    }
    match proxy.mode.as_str() {
        "manual" => proxy_auth_mode(proxy) != "basic" && has_manual_proxy(proxy),
        "system" => proxy_auth_mode(proxy) != "basic",
        _ => false,
    }
}

fn has_manual_proxy(proxy: &ProxySettings) -> bool {
    let (http, https) = crate::manual_proxy_urls(proxy);
    http.is_some() || https.is_some()
}

pub fn resolve_proxy_url_for_target(proxy: &ProxySettings, target_url: &str) -> Option<String> {
    match proxy.mode.as_str() {
        "manual" => {
            let (http, https) = crate::manual_proxy_urls(proxy);
            let use_https = target_url
                .trim()
                .to_ascii_lowercase()
                .starts_with("https://");
            if use_https {
                https.or(http)
            } else {
                http.or(https)
            }
        }
        "system" => system_proxy_url_for_target(target_url),
        _ => None,
    }
}

pub(crate) fn system_proxy_url_for_target(target_url: &str) -> Option<String> {
    #[cfg(windows)]
    {
        if let Some(url) = proxy_windows::resolve_proxy_for_url(target_url) {
            return Some(url);
        }
        if let Some(url) = proxy_windows::static_proxy_url() {
            return Some(url);
        }
    }

    let use_https = target_url
        .trim()
        .to_ascii_lowercase()
        .starts_with("https://");
    let keys = if use_https {
        ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]
    } else {
        ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"]
    };
    for key in keys {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn build_proxy_auth(auth_mode: &str) -> Auth {
    let mut auth = Auth::new();
    match auth_mode {
        "basic" => {
            auth.basic(true);
        }
        "ntlm" => {
            auth.ntlm(true);
        }
        "negotiate" => {
            auth.gssnegotiate(true);
        }
        _ => {
            // libcurl CURLAUTH_ANY: negotiate Basic / Digest / NTLM / SPNEGO on 407.
            auth.auto(true);
        }
    }
    auth
}

fn configure_proxy(easy: &mut Easy, proxy: &ProxySettings, target_url: &str) -> Result<(), String> {
    if proxy_auth_mode(proxy) != "basic" {
        ensure_curl_ntlm()?;
    }
    let raw = resolve_proxy_url_for_target(proxy, target_url)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "No proxy URL is configured for this request.".to_string())?;
    let parsed = proxy_uri::parse_proxy(&raw)?;
    easy.proxy(&parsed.endpoint)
        .map_err(|error| error.to_string())?;
    if !parsed.username.is_empty() {
        let auth_mode = proxy_auth_mode(proxy);
        let proxy_user = match auth_mode {
            "basic" | "auto" => parsed.username.clone(),
            _ => proxy_uri::ntlm_proxy_principal(&parsed.username),
        };
        easy.proxy_username(&proxy_user)
            .map_err(|error| error.to_string())?;
        easy.proxy_password(&parsed.password)
            .map_err(|error| error.to_string())?;
    }
    let auth = build_proxy_auth(proxy_auth_mode(proxy));
    easy.proxy_auth(&auth)
        .map_err(|error| error.to_string())?;
    // Allow multi-step proxy auth (407 → NTLM) on CONNECT, same as Insomnia/libcurl.
    easy.unrestricted_auth(true)
        .map_err(|error| error.to_string())?;
    let noproxy = proxy_env::merge_no_proxy_with_process(&proxy_env::no_proxy_list(Some(proxy)));
    if !noproxy.is_empty() {
        easy.noproxy(&noproxy)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn normalize_body_mode(mode: &str) -> String {
    match mode {
        "node" => "multipart".to_string(),
        other => other.to_string(),
    }
}

fn apply_body(easy: &mut Easy, method: &Method, request: &RestRequest) -> Result<(), String> {
    if *method == Method::GET || *method == Method::HEAD {
        return Ok(());
    }

    let body_mode = normalize_body_mode(&request.body_mode);
    match body_mode.as_str() {
        "form" => {
            let body = request
                .form
                .iter()
                .filter(|field| field.enabled && !field.key.trim().is_empty())
                .filter(|field| field.part_type.as_deref() != Some("file"))
                .map(|field| {
                    format!(
                        "{}={}",
                        urlencoding::encode(&field.key),
                        urlencoding::encode(&field.value)
                    )
                })
                .collect::<Vec<_>>()
                .join("&");
            easy.post(true).map_err(|error| error.to_string())?;
            easy.post_fields_copy(body.as_bytes())
                .map_err(|error| error.to_string())?;
        }
        "multipart" => {
            let mut form = curl::easy::Form::new();
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
                    form.part(&field.key)
                        .content_type("application/octet-stream")
                        .filename(&file_name)
                        .buffer(&file_name, bytes)
                        .add()
                        .map_err(|error| error.to_string())?;
                } else {
                    form.part(&field.key)
                        .contents(field.value.as_bytes())
                        .add()
                        .map_err(|error| error.to_string())?;
                }
            }
            easy.httppost(form).map_err(|error| error.to_string())?;
        }
        "none" => {}
        _ => {
            if !request.body.is_empty() {
                easy.post_fields_copy(request.body.as_bytes())
                    .map_err(|error| error.to_string())?;
            }
        }
    }
    Ok(())
}

fn install_response_header_collector(
    easy: &mut Easy,
    headers: Arc<Mutex<HashMap<String, String>>>,
) -> Result<(), String> {
    easy.header_function(move |data| {
        let line = String::from_utf8_lossy(data);
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() || line.starts_with("HTTP/") {
            return true;
        }
        if let Some((name, value)) = line.split_once(':') {
            if let Ok(mut map) = headers.lock() {
                map.insert(name.trim().to_string(), value.trim().to_string());
            }
        }
        true
    })
    .map_err(|error| error.to_string())
}

pub fn curl_get(
    url: &str,
    proxy: Option<&ProxySettings>,
    follow_redirects: bool,
    timeout_secs: u64,
) -> Result<(u16, u128), String> {
    let mut easy = Easy::new();
    easy.url(url).map_err(|error| error.to_string())?;
    easy.follow_location(follow_redirects)
        .map_err(|error| error.to_string())?;
    easy.timeout(Duration::from_secs(timeout_secs))
        .map_err(|error| error.to_string())?;
    easy.ssl_verify_peer(true)
        .map_err(|error| error.to_string())?;

    if let Some(proxy) = proxy {
        if proxy.mode != "none" {
            configure_proxy(&mut easy, proxy, url)?;
        }
    }

    let started = Instant::now();
    easy.perform().map_err(|error| error.to_string())?;
    let status = easy
        .response_code()
        .map_err(|error| error.to_string())? as u16;
    Ok((status, started.elapsed().as_millis()))
}

pub fn execute_request_curl_sync(
    app: Option<AppHandle>,
    request: &RestRequest,
    proxy: Option<&ProxySettings>,
    follow_redirects: bool,
    timeout_secs: u64,
) -> Result<RestResponse, String> {
    let method = request
        .method
        .parse::<Method>()
        .map_err(|_| format!("Unsupported HTTP method: {}", request.method))?;

    let mut easy = Easy::new();
    easy.url(&request.url)
        .map_err(|error| error.to_string())?;
    easy.custom_request(method.as_str())
        .map_err(|error| error.to_string())?;
    easy.follow_location(follow_redirects)
        .map_err(|error| error.to_string())?;
    easy.timeout(Duration::from_secs(timeout_secs))
        .map_err(|error| error.to_string())?;
    easy.ssl_verify_peer(true)
        .map_err(|error| error.to_string())?;

    if let Some(proxy) = proxy.filter(|value| value.mode != "none") {
        configure_proxy(&mut easy, proxy, &request.url)?;
    }

    let mut header_list = List::new();
    let is_multipart = normalize_body_mode(&request.body_mode) == "multipart";
    let mut has_headers = false;
    for (key, value) in &request.headers {
        if is_multipart && key.to_ascii_lowercase() == "content-type" {
            continue;
        }
        header_list
            .append(&format!("{key}: {value}"))
            .map_err(|error| error.to_string())?;
        has_headers = true;
    }
    if has_headers {
        easy.http_headers(header_list)
            .map_err(|error| error.to_string())?;
    }

    apply_body(&mut easy, &method, request)?;

    let headers_cell = Arc::new(Mutex::new(HashMap::new()));
    install_response_header_collector(&mut easy, headers_cell.clone())?;
    let started = Instant::now();
    let request_id = request.id.clone();
    let stream = request.stream;

    let body_cell = Arc::new(Mutex::new(Vec::new()));
    if stream {
        if let Some(app) = app.as_ref() {
            let app = app.clone();
            let body_cell = body_cell.clone();
            easy.write_function(move |data| {
                if let Ok(mut body) = body_cell.lock() {
                    body.extend_from_slice(data);
                }
                let text = String::from_utf8_lossy(data);
                let _ = app.emit(
                    STREAM_EVENT,
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
                );
                Ok(data.len())
            })
            .map_err(|error| error.to_string())?;
        } else {
            let body_cell = body_cell.clone();
            easy.write_function(move |data| {
                if let Ok(mut body) = body_cell.lock() {
                    body.extend_from_slice(data);
                }
                Ok(data.len())
            })
            .map_err(|error| error.to_string())?;
        }
    } else {
        let body_cell = body_cell.clone();
        easy.write_function(move |data| {
            if let Ok(mut body) = body_cell.lock() {
                body.extend_from_slice(data);
            }
            Ok(data.len())
        })
        .map_err(|error| error.to_string())?;
    }

    easy.perform().map_err(|error| {
        crate::http_errors::describe_curl_error(&error.to_string())
    })?;

    let status_code = easy
        .response_code()
        .map_err(|error| error.to_string())? as u16;
    let status_text = reqwest::StatusCode::from_u16(status_code)
        .ok()
        .and_then(|value| value.canonical_reason())
        .unwrap_or("")
        .to_string();
    let duration_ms = started.elapsed().as_millis();
    let body = body_cell
        .lock()
        .map_err(|_| "Response body lock poisoned.".to_string())?;
    let body_text = String::from_utf8_lossy(&body).into_owned();
    let headers_map = headers_cell
        .lock()
        .map_err(|_| "Response headers lock poisoned.".to_string())?
        .clone();

    if stream {
        if let Some(app) = app.as_ref() {
            let _ = app.emit(
                STREAM_EVENT,
                StreamEvent {
                    request_id: request.id.clone(),
                    chunk: String::new(),
                    done: true,
                    status: Some(status_code),
                    status_text: Some(status_text.clone()),
                    headers: Some(headers_map.clone()),
                    duration_ms: Some(duration_ms),
                    error: None,
                },
            );
        }
    }

    Ok(RestResponse {
        status: status_code,
        status_text,
        duration_ms,
        headers: headers_map,
        body: body_text,
    })
}

use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::Mutex,
    time::Instant,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_util::StreamExt;
use reqwest::{header::HeaderMap, Method};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tokio::time::{sleep, timeout, Duration};

const STREAM_EVENT: &str = "restpilot:request-stream";

#[derive(Default)]
struct RuntimeState {
    cancellations: Mutex<HashSet<String>>,
}

#[derive(Debug, Deserialize)]
struct ProxySettings {
    mode: String,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SendRequestPayload {
    request: RestRequest,
    proxy: Option<ProxySettings>,
}

#[derive(Debug, Clone, Deserialize)]
struct RestRequest {
    id: String,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body_mode: String,
    raw_type: Option<String>,
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
    headers: Option<HashMap<String, String>>,
    duration_ms: Option<u128>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct RestResponse {
    status: u16,
    status_text: String,
    duration_ms: u128,
    headers: HashMap<String, String>,
    body: String,
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

        tauri::async_runtime::spawn(async move {
            let state = app.state::<RuntimeState>();
            let result = tokio::select! {
                result = execute_request(app.clone(), state.inner(), request, proxy) => result,
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
            headers: HashMap::new(),
            body: String::new(),
        });
    }

    let request_id = payload.request.id.clone();
    let request_future = execute_request(app, state.inner(), payload.request, payload.proxy);
    let cancel_future = wait_for_cancel(state.inner(), request_id);

    tokio::select! {
        result = request_future => result,
        _ = cancel_future => Err("Request cancelled.".to_string()),
    }
}

fn build_http_client(proxy: Option<ProxySettings>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::limited(10));

    if let Some(proxy) = proxy {
        match proxy.mode.as_str() {
            "system" => {
                if let Ok(proxy_url) = std::env::var("HTTPS_PROXY")
                    .or_else(|_| std::env::var("https_proxy"))
                    .or_else(|_| std::env::var("HTTP_PROXY"))
                    .or_else(|_| std::env::var("http_proxy"))
                {
                    if !proxy_url.trim().is_empty() {
                        let proxy = reqwest::Proxy::all(proxy_url.trim())
                            .map_err(|error| error.to_string())?;
                        builder = builder.proxy(proxy);
                    }
                }
            }
            "manual" => {
                let host = proxy.host.unwrap_or_default().trim().to_string();
                if !host.is_empty() {
                    let port = proxy.port.unwrap_or(8080);
                    let scheme = if host.starts_with("http://") || host.starts_with("https://") {
                        host.clone()
                    } else {
                        format!("http://{host}:{port}")
                    };
                    let mut proxy_builder = reqwest::Proxy::all(&scheme)
                        .map_err(|error| error.to_string())?;
                    if let (Some(username), Some(password)) = (proxy.username, proxy.password) {
                        if !username.is_empty() {
                            proxy_builder = proxy_builder.basic_auth(&username, &password);
                        }
                    }
                    builder = builder.proxy(proxy_builder);
                }
            }
            _ => {}
        }
    }

    builder.build().map_err(|error| error.to_string())
}

fn collect_headers(response: &reqwest::Response) -> HashMap<String, String> {
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
) -> Result<RestResponse, String> {
    let method = request
        .method
        .parse::<Method>()
        .map_err(|_| format!("Unsupported HTTP method: {}", request.method))?;

    let client = build_http_client(proxy)?;
    let request_id = request.id.clone();
    let stream = request.stream;

    let mut builder = client.request(method.clone(), request.url.clone());
    let mut headers = HeaderMap::new();

    for (key, value) in &request.headers {
        let name = key
            .parse::<reqwest::header::HeaderName>()
            .map_err(|_| format!("Invalid header name: {}", key))?;
        let value = value
            .parse::<reqwest::header::HeaderValue>()
            .map_err(|_| format!("Invalid value for header: {}", key))?;
        headers.insert(name, value);
    }

    builder = builder.headers(headers);
    builder = apply_body(builder, &method, &request)?;

    let started = Instant::now();
    let timeout_secs = if stream { 600 } else { 60 };
    let response = timeout(Duration::from_secs(timeout_secs), builder.send())
        .await
        .map_err(|_| format!("Request timed out after {timeout_secs} seconds."))?
        .map_err(|error| error.to_string())?;

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

        return Ok(RestResponse {
            status: status_code,
            status_text,
            duration_ms,
            headers: headers_map,
            body,
        });
    }

    let body = response.text().await.map_err(|error| error.to_string())?;

    Ok(RestResponse {
        status: status_code,
        status_text,
        duration_ms: started.elapsed().as_millis(),
        headers: headers_map,
        body,
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

pub fn run() {
    tauri::Builder::default()
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
            load_app_config,
            save_app_config,
            send_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running RestPilot");
}

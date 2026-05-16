use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::Mutex,
    time::Instant,
};

use reqwest::{header::HeaderMap, Method};
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tokio::time::{sleep, timeout, Duration};

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

#[derive(Debug, Deserialize)]
struct RestRequest {
    id: String,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body_mode: String,
    raw_type: Option<String>,
    body: String,
    form: Vec<FormPair>,
}

#[derive(Debug, Deserialize)]
struct FormPair {
    key: String,
    value: String,
    enabled: bool,
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
    state: tauri::State<'_, RuntimeState>,
    payload: SendRequestPayload,
) -> Result<RestResponse, String> {
    state
        .cancellations
        .lock()
        .map_err(|_| "Cancellation state is unavailable.".to_string())?
        .remove(&payload.request.id);

    let request_id = payload.request.id.clone();
    let request_future = execute_request(payload.request, payload.proxy);
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

async fn execute_request(request: RestRequest, proxy: Option<ProxySettings>) -> Result<RestResponse, String> {
    let method = request
        .method
        .parse::<Method>()
        .map_err(|_| format!("Unsupported HTTP method: {}", request.method))?;

    let client = build_http_client(proxy)?;

    let mut builder = client.request(method.clone(), request.url);
    let mut headers = HeaderMap::new();

    for (key, value) in request.headers {
        let name = key
            .parse::<reqwest::header::HeaderName>()
            .map_err(|_| format!("Invalid header name: {}", key))?;
        let value = value
            .parse::<reqwest::header::HeaderValue>()
            .map_err(|_| format!("Invalid value for header: {}", key))?;
        headers.insert(name, value);
    }

    builder = builder.headers(headers);

    if request.body_mode == "form" && method != Method::GET && method != Method::HEAD {
        let form = request
            .form
            .into_iter()
            .filter(|field| field.enabled && !field.key.trim().is_empty())
            .map(|field| (field.key, field.value))
            .collect::<Vec<_>>();
        builder = builder.form(&form);
    } else if request.body_mode == "node" && method != Method::GET && method != Method::HEAD {
        let mut multipart_form = reqwest::multipart::Form::new();
        for field in request.form {
            if field.enabled && !field.key.trim().is_empty() {
                multipart_form = multipart_form.text(field.key, field.value);
            }
        }
        builder = builder.multipart(multipart_form);
    } else if !request.body.is_empty() && method != Method::GET && method != Method::HEAD {
        builder = builder.body(request.body);
    }

    let started = Instant::now();
    let response = timeout(Duration::from_secs(60), builder.send())
        .await
        .map_err(|_| "Request timed out after 60 seconds.".to_string())?
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let headers = response
        .headers()
        .iter()
        .map(|(key, value)| {
            (
                key.as_str().to_string(),
                value.to_str().unwrap_or("<binary>").to_string(),
            )
        })
        .collect();
    let body = response.text().await.map_err(|error| error.to_string())?;

    Ok(RestResponse {
        status: status.as_u16(),
        status_text,
        duration_ms: started.elapsed().as_millis(),
        headers,
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

pub fn run() {
    tauri::Builder::default()
        .manage(RuntimeState::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("RestPilot");
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

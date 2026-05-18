use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

use crate::{build_http_client, NetworkSettings, ProxySettings, RuntimeState};

pub const AI_STREAM_EVENT: &str = "restpilot:ai-stream";

#[derive(Debug, Deserialize)]
pub struct AiConnectionPayload {
    pub base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    pub proxy: Option<ProxySettings>,
    #[serde(default)]
    pub network: Option<NetworkSettings>,
    /// Legacy field; prefer `network.timeout_secs`.
    #[serde(default)]
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct AiTestResult {
    pub ok: bool,
    pub error: Option<String>,
    pub model_count: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct AiModelsResult {
    pub models: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AiChatMessagePayload {
    pub role: String,
    pub content: Option<String>,
    #[serde(default)]
    pub tool_call_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub tool_calls: Option<Vec<AiToolCallPayload>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AiToolCallPayload {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: Option<String>,
    pub function: AiToolFunctionPayload,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AiToolFunctionPayload {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AiToolDefinitionPayload {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct AiChatStreamPayload {
    pub chat_id: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    pub model: String,
    pub messages: Vec<AiChatMessagePayload>,
    #[serde(default)]
    pub tools: Option<Vec<AiToolDefinitionPayload>>,
    #[serde(default)]
    pub tool_choice: Option<String>,
    pub proxy: Option<ProxySettings>,
    #[serde(default)]
    pub network: Option<NetworkSettings>,
    #[serde(default)]
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiStreamEvent {
    pub chat_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<AiStreamToolCall>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiStreamToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

fn normalize_base_url(base_url: &str) -> String {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return "http://127.0.0.1:1234/v1".to_string();
    }
    trimmed.trim_end_matches('/').to_string()
}

fn models_url(base: &str) -> String {
    format!("{}/models", normalize_base_url(base))
}

fn chat_url(base: &str) -> String {
    format!("{}/chat/completions", normalize_base_url(base))
}

fn apply_auth(headers: &mut HeaderMap, api_key: Option<&str>) {
    let key = api_key.map(str::trim).unwrap_or("");
    if key.is_empty() {
        return;
    }
    if let Ok(value) = HeaderValue::from_str(&format!("Bearer {key}")) {
        headers.insert(AUTHORIZATION, value);
    }
}

fn resolve_timeout_secs(network: &Option<NetworkSettings>, legacy: Option<u64>, streaming: bool) -> u64 {
    let base = network
        .as_ref()
        .and_then(|n| n.timeout_secs)
        .or(legacy)
        .unwrap_or(60)
        .clamp(5, 600);
    if streaming {
        base.max(600)
    } else {
        base
    }
}

fn timeout_duration(network: &Option<NetworkSettings>, legacy: Option<u64>, streaming: bool) -> std::time::Duration {
    std::time::Duration::from_secs(resolve_timeout_secs(network, legacy, streaming))
}

fn follow_redirects(network: &Option<NetworkSettings>) -> bool {
    network
        .as_ref()
        .and_then(|n| n.follow_redirects)
        .unwrap_or(true)
}

async fn fetch_models(
    base_url: &str,
    api_key: Option<&str>,
    proxy: Option<ProxySettings>,
    network: &Option<NetworkSettings>,
    legacy_timeout: Option<u64>,
) -> Result<Vec<String>, String> {
    let url = models_url(base_url);
    let client = build_http_client(proxy, follow_redirects(network), Some(&url))?;
    let mut headers = HeaderMap::new();
    apply_auth(&mut headers, api_key);

    let response = client
        .get(&url)
        .headers(headers)
        .timeout(timeout_duration(network, legacy_timeout, false))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let text = response.text().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mut models: Vec<String> = body
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("id").and_then(|id| id.as_str()).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    if models.is_empty() {
        if let Some(id) = body.get("id").and_then(|v| v.as_str()) {
            models.push(id.to_string());
        }
    }

    models.sort_by(|a, b| a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase()));
    Ok(models)
}

#[tauri::command]
pub async fn test_ai_connection(payload: AiConnectionPayload) -> AiTestResult {
    match fetch_models(
        &payload.base_url,
        payload.api_key.as_deref(),
        payload.proxy,
        &payload.network,
        payload.timeout_secs,
    )
    .await
    {
        Ok(models) => AiTestResult {
            ok: true,
            error: None,
            model_count: Some(models.len()),
        },
        Err(error) => AiTestResult {
            ok: false,
            error: Some(error),
            model_count: None,
        },
    }
}

#[tauri::command]
pub async fn list_ai_models(payload: AiConnectionPayload) -> AiModelsResult {
    match fetch_models(
        &payload.base_url,
        payload.api_key.as_deref(),
        payload.proxy,
        &payload.network,
        payload.timeout_secs,
    )
    .await
    {
        Ok(models) => AiModelsResult {
            models,
            error: None,
        },
        Err(error) => AiModelsResult {
            models: vec![],
            error: Some(error),
        },
    }
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    content: Option<String>,
    reasoning_content: Option<String>,
    #[serde(default)]
    reasoning: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: Option<StreamDelta>,
    #[serde(default)]
    message: Option<serde_json::Value>,
    #[serde(default)]
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Option<Vec<StreamChoice>>,
}

#[derive(Debug, Default)]
pub(crate) struct ToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
}

fn extract_thinking(delta: &StreamDelta) -> Option<String> {
    delta
        .reasoning_content
        .as_ref()
        .filter(|s| !s.is_empty())
        .cloned()
        .or_else(|| delta.reasoning.as_ref().filter(|s| !s.is_empty()).cloned())
}

pub(crate) fn parse_sse_data_line(line: &str) -> Option<serde_json::Value> {
    let trimmed = line.trim();
    if !trimmed.starts_with("data:") {
        return None;
    }
    let data = trimmed.strip_prefix("data:")?.trim();
    if data == "[DONE]" {
        return None;
    }
    serde_json::from_str(data).ok()
}

pub(crate) fn process_sse_json(
    value: &serde_json::Value,
    thinking_out: &mut String,
    content_out: &mut String,
    tool_calls: &mut Vec<ToolCallAccumulator>,
) {
    let chunk: StreamChunk = match serde_json::from_value(value.clone()) {
        Ok(c) => c,
        Err(_) => return,
    };

    let Some(choices) = chunk.choices else { return };
    for choice in choices {
        if let Some(delta) = choice.delta {
            if let Some(t) = extract_thinking(&delta) {
                thinking_out.push_str(&t);
            }
            if let Some(c) = delta.content {
                content_out.push_str(&c);
            }
            if let Some(delta_tools) = delta.tool_calls {
                merge_tool_calls_from_message(
                    &serde_json::json!({ "tool_calls": delta_tools }),
                    tool_calls,
                );
            }
        }
        if let Some(message) = choice.message {
            merge_tool_calls_from_message(&message, tool_calls);
        }
    }
}

fn merge_tool_calls_from_message(message: &serde_json::Value, acc: &mut Vec<ToolCallAccumulator>) {
    let Some(calls) = message.get("tool_calls").and_then(|v| v.as_array()) else {
        return;
    };
    for call in calls {
        let id = call
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let index = call.get("index").and_then(|v| v.as_u64()).unwrap_or(acc.len() as u64) as usize;
        while acc.len() <= index {
            acc.push(ToolCallAccumulator::default());
        }
        let entry = &mut acc[index];
        if !id.is_empty() {
            entry.id = id;
        }
        if let Some(function) = call.get("function") {
            if let Some(name) = function.get("name").and_then(|v| v.as_str()) {
                if !name.is_empty() {
                    entry.name = name.to_string();
                }
            }
            if let Some(args) = function.get("arguments").and_then(|v| v.as_str()) {
                entry.arguments.push_str(args);
            }
        }
    }
}

fn emit_ai(app: &tauri::AppHandle, event: AiStreamEvent) {
    let _ = app.emit(AI_STREAM_EVENT, event);
}

fn is_cancelled(state: &RuntimeState, chat_id: &str) -> bool {
    state
        .cancellations
        .lock()
        .ok()
        .map(|set| set.contains(chat_id))
        .unwrap_or(false)
}

#[tauri::command]
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, RuntimeState>,
    payload: AiChatStreamPayload,
) -> Result<(), String> {
    let chat_id = payload.chat_id.clone();
    runtime
        .cancellations
        .lock()
        .map_err(|_| "Cancellation state is unavailable.".to_string())?
        .remove(&chat_id);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_handle.state::<RuntimeState>();
        if let Err(error) = run_ai_chat_stream(app_handle.clone(), state.inner(), payload).await {
            emit_ai(
                &app_handle,
                AiStreamEvent {
                    chat_id,
                    delta: None,
                    thinking: None,
                    done: true,
                    error: Some(error),
                    tool_calls: None,
                },
            );
        }
    });

    Ok(())
}

async fn run_ai_chat_stream(
    app: tauri::AppHandle,
    runtime: &RuntimeState,
    payload: AiChatStreamPayload,
) -> Result<(), String> {
    let chat_id = payload.chat_id.clone();
    let url = chat_url(&payload.base_url);
    let client = build_http_client(
        payload.proxy.clone(),
        follow_redirects(&payload.network),
        Some(&url),
    )?;

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    apply_auth(&mut headers, payload.api_key.as_deref());

    let mut body_value = serde_json::json!({
        "model": payload.model,
        "messages": payload.messages,
        "stream": true,
    });
    if let Some(tools) = payload.tools.filter(|items| !items.is_empty()) {
        body_value["tools"] = serde_json::to_value(tools).map_err(|e| e.to_string())?;
        if let Some(choice) = payload.tool_choice.filter(|s| !s.is_empty()) {
            body_value["tool_choice"] = serde_json::Value::String(choice);
        }
    }
    let body_text = serde_json::to_string(&body_value).map_err(|e| e.to_string())?;

    let response = client
        .post(&url)
        .headers(headers)
        .body(body_text)
        .timeout(timeout_duration(
            &payload.network,
            payload.timeout_secs,
            true,
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let short = if text.len() > 400 {
            format!("{}…", &text[..400])
        } else {
            text
        };
        return Err(format!("HTTP {status}: {short}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut pending_thinking = String::new();
    let mut pending_delta = String::new();
    let mut tool_calls: Vec<ToolCallAccumulator> = Vec::new();
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        if is_cancelled(runtime, &chat_id) {
            return Err("Chat cancelled.".to_string());
        }

        let bytes = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end().to_string();
            buffer = buffer[pos + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            let Some(value) = parse_sse_data_line(&line) else {
                if line.trim() == "data: [DONE]" || line.contains("[DONE]") {
                    break;
                }
                continue;
            };

            process_sse_json(&value, &mut pending_thinking, &mut pending_delta, &mut tool_calls);

            let should_flush =
                !pending_delta.is_empty() || !pending_thinking.is_empty() || last_emit.elapsed().as_millis() > 80;

            if should_flush {
                emit_ai(
                    &app,
                    AiStreamEvent {
                        chat_id: chat_id.clone(),
                        delta: if pending_delta.is_empty() {
                            None
                        } else {
                            Some(std::mem::take(&mut pending_delta))
                        },
                        thinking: if pending_thinking.is_empty() {
                            None
                        } else {
                            Some(std::mem::take(&mut pending_thinking))
                        },
                        done: false,
                        error: None,
                        tool_calls: None,
                    },
                );
                last_emit = std::time::Instant::now();
            }
        }
    }

  if is_cancelled(runtime, &chat_id) {
        return Err("Chat cancelled.".to_string());
    }

    let finalized_tools: Vec<AiStreamToolCall> = tool_calls
        .into_iter()
        .filter(|t| !t.name.is_empty())
        .map(|t| AiStreamToolCall {
            id: if t.id.is_empty() {
                format!("call_{}", uuid_simple())
            } else {
                t.id
            },
            name: t.name,
            arguments: t.arguments,
        })
        .collect();

    emit_ai(
        &app,
        AiStreamEvent {
            chat_id,
            delta: if pending_delta.is_empty() {
                None
            } else {
                Some(pending_delta)
            },
            thinking: if pending_thinking.is_empty() {
                None
            } else {
                Some(pending_thinking)
            },
            done: true,
            error: None,
            tool_calls: if finalized_tools.is_empty() {
                None
            } else {
                Some(finalized_tools)
            },
        },
    );

    Ok(())
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sse_data_line_extracts_json() {
        let v = parse_sse_data_line("data: {\"choices\":[]}").expect("json");
        assert!(v.get("choices").is_some());
        assert!(parse_sse_data_line("data: [DONE]").is_none());
    }

    #[test]
    fn process_sse_emits_content_and_thinking() {
        let json = serde_json::json!({
            "choices": [{
                "delta": {
                    "content": "Hi",
                    "reasoning_content": "think"
                }
            }]
        });
        let mut thinking = String::new();
        let mut content = String::new();
        let mut tools = vec![];
        process_sse_json(&json, &mut thinking, &mut content, &mut tools);
        assert_eq!(content, "Hi");
        assert_eq!(thinking, "think");
    }
}

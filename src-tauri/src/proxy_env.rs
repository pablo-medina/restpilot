//! NO_PROXY list from settings (comma-separated hosts).

use crate::ProxySettings;

pub fn no_proxy_list(proxy: Option<&ProxySettings>) -> String {
    proxy
        .and_then(|value| value.no_proxy.as_ref())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

/// Runs `action` with `NO_PROXY` merged (settings + process), then restores the previous value.
pub fn with_merged_no_proxy<F, R>(list: &str, action: F) -> R
where
    F: FnOnce() -> R,
{
    let merged = merge_no_proxy_with_process(list);
    if merged.is_empty() {
        return action();
    }

    let previous = std::env::var("NO_PROXY")
        .ok()
        .or_else(|| std::env::var("no_proxy").ok());
    std::env::set_var("NO_PROXY", &merged);
    let result = action();
    restore_no_proxy(previous);
    result
}

fn restore_no_proxy(previous: Option<String>) {
    if let Some(value) = previous {
        std::env::set_var("NO_PROXY", value);
    } else {
        std::env::remove_var("NO_PROXY");
    }
}

pub fn merge_no_proxy_with_process(list: &str) -> String {
    let list = list.trim();
    if list.is_empty() {
        return std::env::var("NO_PROXY")
            .or_else(|_| std::env::var("no_proxy"))
            .unwrap_or_default();
    }
    let from_env = std::env::var("NO_PROXY")
        .or_else(|_| std::env::var("no_proxy"))
        .unwrap_or_default();
    if from_env.trim().is_empty() {
        return list.to_string();
    }
    format!("{from_env},{list}")
}

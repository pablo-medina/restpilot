//! NO_PROXY resolution from settings and the process environment.

use crate::ProxySettings;

fn configured_no_proxy(proxy: Option<&ProxySettings>) -> String {
    proxy
        .and_then(|value| value.no_proxy.as_ref())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

fn process_no_proxy() -> String {
    std::env::var("NO_PROXY")
        .or_else(|_| std::env::var("no_proxy"))
        .unwrap_or_default()
}

pub fn effective_no_proxy(proxy: Option<&ProxySettings>) -> String {
    if let Some(proxy) = proxy {
        if proxy.mode == "environment" {
            return if proxy.use_no_proxy_env {
                process_no_proxy()
            } else {
                String::new()
            };
        }
    }
    merge_no_proxy_with_process(&configured_no_proxy(proxy))
}

/// Runs `action` with exactly the supplied NO_PROXY value, then restores the process environment.
pub fn with_no_proxy<F, R>(list: &str, action: F) -> R
where
    F: FnOnce() -> R,
{
    let previous_upper = std::env::var("NO_PROXY").ok();
    let previous_lower = std::env::var("no_proxy").ok();
    std::env::remove_var("no_proxy");
    if list.trim().is_empty() {
        std::env::remove_var("NO_PROXY");
    } else {
        std::env::set_var("NO_PROXY", list.trim());
    }
    let result = action();
    restore_env("NO_PROXY", previous_upper);
    restore_env("no_proxy", previous_lower);
    result
}

fn restore_env(name: &str, previous: Option<String>) {
    if let Some(value) = previous {
        std::env::set_var(name, value);
    } else {
        std::env::remove_var(name);
    }
}

pub fn merge_no_proxy_with_process(list: &str) -> String {
    let list = list.trim();
    if list.is_empty() {
        return process_no_proxy();
    }
    let from_env = process_no_proxy();
    if from_env.trim().is_empty() {
        return list.to_string();
    }
    format!("{from_env},{list}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_environment_no_proxy_is_ignored() {
        let proxy = ProxySettings {
            mode: "environment".to_string(),
            http_proxy: None,
            https_proxy: None,
            host: None,
            port: None,
            username: None,
            password: None,
            auth_mode: Some("auto".to_string()),
            no_proxy: Some("configured.example".to_string()),
            use_http_proxy_env: true,
            use_https_proxy_env: true,
            use_no_proxy_env: false,
        };
        assert_eq!(effective_no_proxy(Some(&proxy)), "");
    }
}

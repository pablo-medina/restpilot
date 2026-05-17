//! Proxy URL normalization (libcurl / Insomnia style).

pub struct ParsedProxy {
    pub endpoint: String,
    pub username: String,
    pub password: String,
}

pub fn parse_proxy(raw: &str) -> Result<ParsedProxy, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("Proxy URL is empty.".to_string());
    }

    let parsed = if raw.contains("://") {
        reqwest::Url::parse(raw)
    } else {
        reqwest::Url::parse(&format!("http://{raw}"))
    }
    .map_err(|error| error.to_string())?;

    let host = parsed
        .host_str()
        .ok_or_else(|| "Proxy URL must include a host.".to_string())?;
    let port = parsed.port().unwrap_or(8080);

    Ok(ParsedProxy {
        endpoint: format!("http://{host}:{port}"),
        username: parsed.username().to_string(),
        password: parsed.password().unwrap_or("").to_string(),
    })
}

/// Principal for NTLM proxy auth (`DOMAIN\user`), matching libcurl / Insomnia on Windows.
pub fn ntlm_proxy_principal(username: &str) -> String {
    let username = username.trim();
    if username.is_empty() {
        return String::new();
    }
    if username.contains('\\') {
        return username.to_string();
    }
    if let Some((user, domain)) = username.split_once('@') {
        let user = user.trim();
        let domain = domain.trim();
        if !user.is_empty() && !domain.is_empty() {
            return format!("{domain}\\{user}");
        }
    }
    #[cfg(windows)]
    {
        if let Ok(domain) = std::env::var("USERDOMAIN") {
            let domain = domain.trim();
            if !domain.is_empty() {
                return format!("{domain}\\{username}");
            }
        }
    }
    username.to_string()
}

/// Full URL with embedded credentials (for display / diagnostics).
pub fn proxy_connect_uri(raw: &str) -> Result<String, String> {
    let parsed = parse_proxy(raw)?;
    if parsed.username.is_empty() {
        return Ok(parsed.endpoint);
    }
    Ok(format!(
        "http://{}:{}@{}",
        urlencoding::encode(&parsed.username),
        urlencoding::encode(&parsed.password),
        parsed
            .endpoint
            .trim_start_matches("http://")
    ))
}

#[cfg(test)]
mod tests {
    use super::{ntlm_proxy_principal, parse_proxy, proxy_connect_uri};

    #[test]
    fn decodes_dollar_password_for_basic_auth() {
        let parsed = parse_proxy("http://user:M3d12036$@proxy.example.com:8080").unwrap();
        assert_eq!(parsed.password, "M3d12036$");
        assert_eq!(parsed.endpoint, "http://proxy.example.com:8080");
    }

    #[test]
    fn builds_uri_with_encoded_password() {
        let uri = proxy_connect_uri("http://user:M3d12036$@proxy.example.com:8080").unwrap();
        assert!(uri.contains("M3d12036%24"));
    }

    #[test]
    fn accepts_host_port_without_scheme() {
        let parsed = parse_proxy("proxy.example.com:8080").unwrap();
        assert_eq!(parsed.endpoint, "http://proxy.example.com:8080");
    }

    #[test]
    fn keeps_domain_backslash_principal() {
        assert_eq!(
            ntlm_proxy_principal(r"CORP\alice"),
            r"CORP\alice"
        );
    }

    #[test]
    fn maps_at_sign_principal() {
        assert_eq!(
            ntlm_proxy_principal("alice@CORP"),
            r"CORP\alice"
        );
    }
}

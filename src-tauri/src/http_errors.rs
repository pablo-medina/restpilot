use std::error::Error as StdError;

use reqwest::StatusCode;

pub fn describe_http_error(error: &reqwest::Error) -> (String, Option<String>) {
  if error.is_timeout() {
    return (
      "Connection timed out.".to_string(),
      Some("Increase the request timeout or check that the proxy host and port are correct.".to_string()),
    );
  }

  if let Some(status) = error.status() {
    return describe_status(status);
  }

  let chain = error_chain(error);
  let lower = chain.to_lowercase();

  if lower.contains("407")
    || lower.contains("proxy authentication")
    || lower.contains("proxy authorization required")
  {
    return (
      "Proxy authentication failed (HTTP 407).".to_string(),
      Some(
        "The proxy rejected the username or password. Use a full proxy URL (user:pass@host:port).".to_string(),
      ),
    );
  }

  if error.is_connect() {
    let hint = if lower.contains("407")
      || lower.contains("proxy authentication")
      || lower.contains("proxy authorization required")
    {
      "Proxy credentials were rejected (407). Check the HTTPS proxy URL.".to_string()
    } else if lower.contains("proxy") || lower.contains("tunnel") {
      "Check the HTTPS proxy URL (host, port, user:pass). HTTP proxy can stay empty.".to_string()
    } else {
      "Check the URL, proxy, firewall, and VPN.".to_string()
    };
    return (chain, Some(hint));
  }

  if lower.contains("certificate")
    || lower.contains("cert")
    || lower.contains("tls")
    || lower.contains("ssl")
  {
    return (
      "TLS certificate error.".to_string(),
      Some(
        "Corporate SSL inspection may require trusting an internal CA (not supported yet).".to_string(),
      ),
    );
  }

  if lower.contains("error sending request") {
    return (
      "The request could not be sent.".to_string(),
      Some(format!("Details: {chain}")),
    );
  }

  (format!("Request failed: {chain}"), None)
}

pub fn describe_status(status: StatusCode) -> (String, Option<String>) {
  if status == StatusCode::PROXY_AUTHENTICATION_REQUIRED {
    return (
      "Proxy authentication failed (HTTP 407).".to_string(),
      Some(
        "Wrong or missing proxy credentials. Check the HTTPS proxy URL.".to_string(),
      ),
    );
  }
  (
    format!("Request failed with HTTP {}.", status.as_u16()),
    None,
  )
}

pub fn describe_curl_error(message: &str) -> String {
  let lower = message.to_lowercase();
  if lower.contains("407")
    || lower.contains("proxy authentication")
    || lower.contains("proxy authorization required")
  {
    return "Proxy authentication failed (HTTP 407).".to_string();
  }
  if lower.contains("timed out") || lower.contains("timeout") {
    return "Connection timed out.".to_string();
  }
  message.to_string()
}

pub fn curl_error_hint(message: &str, _auth_mode: &str) -> Option<String> {
  let lower = message.to_lowercase();
  if lower.contains("not available in this build") {
    return Some("Install the latest RestPilot build.".to_string());
  }
  if lower.contains("build-time decision")
    || lower.contains("requested feature, protocol or option was not found")
  {
    return Some("Install the latest RestPilot build.".to_string());
  }
  if lower.contains("407")
    || lower.contains("proxy authentication")
    || lower.contains("proxy authorization required")
  {
    return Some("Check proxy URL and credentials.".to_string());
  }
  if lower.contains("proxy") || lower.contains("tunnel") {
    return Some("Check proxy settings.".to_string());
  }
  None
}

fn error_chain(error: &reqwest::Error) -> String {
  let mut parts = vec![error.to_string()];
  let mut source = StdError::source(error);
  while let Some(err) = source {
    let text = err.to_string();
    if !text.is_empty() && !parts.iter().any(|p| p == &text) {
      parts.push(text);
    }
    source = err.source();
  }
  parts.join(" — ")
}

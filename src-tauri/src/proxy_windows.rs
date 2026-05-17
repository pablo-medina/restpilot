//! Resolves the effective HTTP proxy for a URL on Windows (PAC / WinHTTP).

#[cfg(windows)]
pub fn resolve_proxy_for_url(target_url: &str) -> Option<String> {
    let pac_url = read_pac_url()?;
    let raw = query_winhttp_proxy(target_url, &pac_url)?;
    format_proxy_url(&raw)
}

#[cfg(not(windows))]
pub fn resolve_proxy_for_url(_target_url: &str) -> Option<String> {
    None
}

#[cfg(windows)]
fn read_pac_url() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
        .ok()?;
    let pac = settings.get_value::<String, _>("AutoConfigURL").ok()?;
    let pac = pac.trim();
    if pac.is_empty() {
        None
    } else {
        Some(pac.to_string())
    }
}

#[cfg(windows)]
fn query_winhttp_proxy(target_url: &str, pac_url: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Networking::WinHttp::{
        WinHttpCloseHandle, WinHttpGetProxyForUrl, WinHttpOpen, WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_ACCESS_TYPE_NO_PROXY, WINHTTP_AUTOPROXY_CONFIG_URL, WINHTTP_AUTOPROXY_OPTIONS,
        WINHTTP_PROXY_INFO,
    };

    let target = to_wide(target_url);
    let pac = to_wide(pac_url);

    unsafe {
        let session = WinHttpOpen(
            PCWSTR::null(),
            WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
            PCWSTR::null(),
            PCWSTR::null(),
            0,
        );
        if session.is_null() {
            return None;
        }

        let mut auto_options = WINHTTP_AUTOPROXY_OPTIONS {
            dwFlags: WINHTTP_AUTOPROXY_CONFIG_URL,
            lpszAutoConfigUrl: PCWSTR(pac.as_ptr()),
            ..Default::default()
        };

        let mut proxy_info = WINHTTP_PROXY_INFO::default();
        let result = WinHttpGetProxyForUrl(
            session,
            PCWSTR(target.as_ptr()),
            &mut auto_options,
            &mut proxy_info,
        );

        let _ = WinHttpCloseHandle(session);

        result.ok()?;

        if proxy_info.dwAccessType == WINHTTP_ACCESS_TYPE_NO_PROXY {
            return None;
        }

        wide_ptr_to_string(proxy_info.lpszProxy)
    }
}

#[cfg(windows)]
fn wide_ptr_to_string(ptr: windows::core::PWSTR) -> Option<String> {
    if ptr.0.is_null() {
        return None;
    }
    unsafe {
        let mut len = 0usize;
        while *ptr.0.add(len) != 0 {
            len += 1;
        }
        let slice = std::slice::from_raw_parts(ptr.0, len);
        String::from_utf16(slice).ok()
    }
}

#[cfg(windows)]
fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn format_proxy_url(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.eq_ignore_ascii_case("DIRECT") {
        return None;
    }

    let first = raw
        .split(';')
        .map(str::trim)
        .find(|part| !part.is_empty() && !part.eq_ignore_ascii_case("DIRECT"))?;

    let first = first
        .strip_prefix("PROXY ")
        .or_else(|| first.strip_prefix("proxy "))
        .unwrap_or(first)
        .trim();

    let host_port = if let Some((_, value)) = first.split_once('=') {
        value.trim()
    } else {
        first
    };

    if host_port.is_empty() {
        return None;
    }

    if host_port.starts_with("http://") || host_port.starts_with("https://") {
        Some(host_port.to_string())
    } else {
        Some(format!("http://{host_port}"))
    }
}

#[cfg(test)]
mod tests {
    use super::format_proxy_url;

    #[test]
    fn parses_proxy_server_registry_format() {
        assert_eq!(
            format_proxy_url("http=proxy.example.com:8080;https=proxy.example.com:8080"),
            Some("http://proxy.example.com:8080".to_string())
        );
    }

    #[test]
    fn parses_proxy_keyword() {
        assert_eq!(
            format_proxy_url("PROXY proxy.example.com:8080"),
            Some("http://proxy.example.com:8080".to_string())
        );
    }
}

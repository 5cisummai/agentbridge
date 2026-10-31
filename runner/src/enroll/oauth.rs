use std::time::Duration;

use anyhow::{Context, Result};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

use crate::config::Config;
use crate::enroll::DeviceCredential;
use crate::DEVICE_CODE_GRANT;
use crate::RUNNER_OAUTH_CLIENT_ID;

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: Option<String>,
    expires_in: u64,
    #[serde(default = "default_interval")]
    interval: u64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct EnrollResponse {
    device_id: String,
    device_secret: String,
    device_name: String,
}

pub async fn run_enroll(gateway_url: Option<String>, device_name: Option<String>) -> Result<()> {
    let mut cfg = Config::load()?;
    if let Some(url) = gateway_url {
        cfg.gateway_url = url;
        cfg.save()?;
    }

    let name = device_name.unwrap_or_else(default_device_name);
    let client = Client::new();
    let auth_base = cfg.gateway_url.trim_end_matches('/');

    let resource = format!("{auth_base}/mcp");
    let code_res: DeviceCodeResponse = client
        .post(format!("{auth_base}/api/auth/device/code"))
        .json(&json!({
            "client_id": RUNNER_OAUTH_CLIENT_ID,
            "scope": "openid profile offline_access agentbridge:devices",
            "resource": resource
        }))
        .send()
        .await
        .context("device code request")?
        .error_for_status()
        .context("device code status")?
        .json()
        .await
        .context("device code json")?;

    println!(
        "Visit {} and enter code: {}",
        code_res.verification_uri, code_res.user_code
    );
    if let Some(uri) = code_res.verification_uri_complete {
        println!("Or open: {uri}");
    }

    let mut interval = Duration::from_secs(code_res.interval.max(5));
    let deadline = std::time::Instant::now() + Duration::from_secs(code_res.expires_in);

    let access_token = loop {
        if std::time::Instant::now() > deadline {
            anyhow::bail!("device authorization timed out");
        }
        tokio::time::sleep(
            interval.min(deadline.saturating_duration_since(std::time::Instant::now())),
        )
        .await;
        if std::time::Instant::now() >= deadline {
            anyhow::bail!("device authorization timed out");
        }
        let res = client
            .post(format!("{auth_base}/api/auth/oauth2/token"))
            .form(&[
                ("grant_type", DEVICE_CODE_GRANT),
                ("device_code", code_res.device_code.as_str()),
                ("client_id", RUNNER_OAUTH_CLIENT_ID),
                ("resource", resource.as_str()),
            ])
            .send()
            .await
            .context("token poll")?;
        if res.status().is_success() {
            let body: TokenResponse = res.json().await.context("token json")?;
            break body.access_token;
        }
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if let Some(next_interval) = retry_interval(&text, interval) {
            interval = next_interval;
            continue;
        }
        anyhow::bail!("token poll failed: {status} {text}");
    };

    let enroll: EnrollResponse = client
        .post(format!("{auth_base}/v1/devices/enroll"))
        .bearer_auth(&access_token)
        .json(&json!({
            "device_name": name,
            "capabilities": capabilities(),
        }))
        .send()
        .await
        .context("enroll request")?
        .error_for_status()
        .context("enroll status")?
        .json()
        .await
        .context("enroll json")?;

    DeviceCredential {
        device_id: enroll.device_id.clone(),
        device_secret: enroll.device_secret,
        gateway_url: cfg.gateway_url.clone(),
        device_name: enroll.device_name.clone(),
    }
    .save()?;

    println!(
        "Enrolled device {} ({})",
        enroll.device_id, enroll.device_name
    );
    Ok(())
}

fn default_device_name() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "clithread-device".into())
}

fn capabilities() -> serde_json::Value {
    json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "adapters": ["generic", "codex", "claude", "cursor"],
        "version": env!("CARGO_PKG_VERSION"),
    })
}

mod hostname {
    use std::ffi::OsString;
    pub fn get() -> Result<OsString, ()> {
        std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("HOST"))
            .map(OsString::from)
            .map_err(|_| ())
    }
}

fn default_interval() -> u64 {
    5
}

fn retry_interval(body: &str, interval: Duration) -> Option<Duration> {
    let value: serde_json::Value = serde_json::from_str(body).ok()?;
    match value.get("error")?.as_str()? {
        "authorization_pending" => Some(interval),
        "slow_down" => Some(interval + Duration::from_secs(5)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_pending_and_slow_down_retry() {
        let interval = Duration::from_secs(5);
        assert_eq!(
            retry_interval(r#"{"error":"authorization_pending"}"#, interval),
            Some(interval)
        );
        assert_eq!(
            retry_interval(r#"{"error":"slow_down"}"#, interval),
            Some(Duration::from_secs(10))
        );
        for error in [
            "access_denied",
            "expired_token",
            "invalid_client",
            "invalid_grant",
        ] {
            assert_eq!(
                retry_interval(&json!({"error":error}).to_string(), interval),
                None
            );
        }
        assert_eq!(retry_interval("bad request", interval), None);
    }
}

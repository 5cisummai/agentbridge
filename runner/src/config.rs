use std::fs;
use std::time::Duration;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::paths;

const DEFAULT_GATEWAY: &str = "http://localhost:8787";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_gateway")]
    pub gateway_url: String,
    #[serde(default = "default_heartbeat_secs")]
    pub heartbeat_interval_secs: u64,
    #[serde(default = "default_max_threads")]
    pub max_threads: usize,
}

fn default_gateway() -> String {
    DEFAULT_GATEWAY.to_string()
}

fn default_heartbeat_secs() -> u64 {
    15
}

fn default_max_threads() -> usize {
    crate::MAX_THREADS
}

impl Default for Config {
    fn default() -> Self {
        Self {
            gateway_url: default_gateway(),
            heartbeat_interval_secs: default_heartbeat_secs(),
            max_threads: default_max_threads(),
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        paths::ensure_dirs()?;
        let path = paths::config_file()?;
        if !path.exists() {
            let cfg = Self::default();
            cfg.save()?;
            return Ok(cfg);
        }
        let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let mut cfg: Config = toml::from_str(&raw).unwrap_or_else(|_| Self::default());
        if let Ok(url) = std::env::var("AGENTBRIDGE_GATEWAY_URL") {
            cfg.gateway_url = url;
        }
        Ok(cfg)
    }

    pub fn save(&self) -> Result<()> {
        paths::ensure_dirs()?;
        let path = paths::config_file()?;
        let raw = toml::to_string_pretty(self).context("serialize config")?;
        fs::write(&path, raw)?;
        Ok(())
    }

    pub fn heartbeat_interval(&self) -> Duration {
        Duration::from_secs(self.heartbeat_interval_secs)
    }

    pub fn ws_url(&self) -> Result<String> {
        let mut url = url::Url::parse(&self.gateway_url).context("invalid gateway_url")?;
        match url.scheme() {
            "http" => url.set_scheme("ws").ok(),
            "https" => url.set_scheme("wss").ok(),
            "ws" | "wss" => Some(()),
            _ => anyhow::bail!("unsupported gateway scheme"),
        };
        url.set_path("/ws");
        url.set_query(None);
        url.set_fragment(None);
        Ok(url.to_string())
    }
}

// Minimal toml without extra dep — use serde_json for device.json only; config uses inline parser
mod toml {
    use super::*;

    pub fn from_str(s: &str) -> Result<Config> {
        let mut cfg = Config::default();
        for line in s.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let k = k.trim();
                let v = v.trim().trim_matches('"');
                match k {
                    "gateway_url" => cfg.gateway_url = v.to_string(),
                    "heartbeat_interval_secs" => {
                        cfg.heartbeat_interval_secs = v.parse().unwrap_or(15);
                    }
                    "max_threads" => {
                        cfg.max_threads = v.parse().unwrap_or(crate::MAX_THREADS);
                    }
                    _ => {}
                }
            }
        }
        Ok(cfg)
    }

    pub fn to_string_pretty(cfg: &Config) -> Result<String> {
        Ok(format!(
            r#"gateway_url = "{}"
heartbeat_interval_secs = {}
max_threads = {}
"#,
            cfg.gateway_url, cfg.heartbeat_interval_secs, cfg.max_threads
        ))
    }
}

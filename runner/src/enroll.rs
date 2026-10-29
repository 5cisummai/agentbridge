pub mod oauth;

use serde::{Deserialize, Serialize};

use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCredential {
    pub device_id: String,
    pub device_secret: String,
    pub gateway_url: String,
    pub device_name: String,
}

impl DeviceCredential {
    pub fn load() -> anyhow::Result<Option<Self>> {
        let path = paths::device_credential_file()?;
        if !path.exists() {
            return Ok(None);
        }
        let raw = std::fs::read_to_string(&path)?;
        Ok(Some(serde_json::from_str(&raw)?))
    }

    pub fn save(&self) -> anyhow::Result<()> {
        paths::ensure_dirs()?;
        let path = paths::device_credential_file()?;
        let raw = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, raw)?;
        paths::set_private_file_permissions(&path)?;
        Ok(())
    }
}

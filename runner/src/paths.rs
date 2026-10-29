use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

pub const APP_QUALIFIER: &str = "agentbridge";

pub fn config_dir() -> Result<PathBuf> {
    if let Ok(t) = std::env::var("AGENTBRIDGE_TEST_DIR") {
        return Ok(PathBuf::from(&t).join("config"));
    }
    directories::ProjectDirs::from("", "", APP_QUALIFIER)
        .map(|d| d.config_dir().to_path_buf())
        .context("could not resolve config directory")
}

pub fn data_dir() -> Result<PathBuf> {
    if let Ok(t) = std::env::var("AGENTBRIDGE_TEST_DIR") {
        return Ok(PathBuf::from(&t).join("data"));
    }
    directories::ProjectDirs::from("", "", APP_QUALIFIER)
        .map(|d| d.data_dir().to_path_buf())
        .context("could not resolve data directory")
}

pub fn config_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("config.toml"))
}

pub fn device_credential_file() -> Result<PathBuf> {
    Ok(config_dir()?.join("device.json"))
}

pub fn sqlite_file() -> Result<PathBuf> {
    Ok(data_dir()?.join("runner.sqlite"))
}

pub fn ensure_dirs() -> Result<()> {
    std::fs::create_dir_all(config_dir()?)?;
    std::fs::create_dir_all(data_dir()?)?;
    Ok(())
}

#[cfg(unix)]
pub fn set_private_file_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
pub fn set_private_file_permissions(_path: &Path) -> Result<()> {
    Ok(())
}

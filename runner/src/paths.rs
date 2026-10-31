use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

pub const APP_QUALIFIER: &str = "clithread";
const LEGACY_APP_QUALIFIER: &str = "agentbridge";

fn project_dirs() -> Result<directories::ProjectDirs> {
    let current = directories::ProjectDirs::from("", "", APP_QUALIFIER)
        .context("could not resolve clithread config directory")?;
    let legacy = directories::ProjectDirs::from("", "", LEGACY_APP_QUALIFIER)
        .context("could not resolve legacy config directory")?;

    if current.config_dir().exists() || current.data_dir().exists() {
        Ok(current)
    } else {
        Ok(legacy)
    }
}

pub fn config_dir() -> Result<PathBuf> {
    if let Ok(t) =
        std::env::var("CLITHREAD_TEST_DIR").or_else(|_| std::env::var("AGENTBRIDGE_TEST_DIR"))
    {
        return Ok(PathBuf::from(&t).join("config"));
    }
    Ok(project_dirs()?.config_dir().to_path_buf())
}

pub fn data_dir() -> Result<PathBuf> {
    if let Ok(t) =
        std::env::var("CLITHREAD_TEST_DIR").or_else(|_| std::env::var("AGENTBRIDGE_TEST_DIR"))
    {
        return Ok(PathBuf::from(&t).join("data"));
    }
    Ok(project_dirs()?.data_dir().to_path_buf())
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
    for dir in [config_dir()?, data_dir()?] {
        #[cfg(unix)]
        {
            use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
            std::fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(&dir)?;
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
        }
        #[cfg(not(unix))]
        std::fs::create_dir_all(&dir)?;
    }
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

pub fn private_file(path: &Path) -> Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.create(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?;
    set_private_file_permissions(path)
}

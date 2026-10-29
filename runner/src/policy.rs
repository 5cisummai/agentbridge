use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PolicyError {
    #[error("path must be absolute")]
    NotAbsolute,
    #[error("path contains parent directory components")]
    ParentComponent,
    #[error("path contains invalid characters")]
    Invalid,
    #[error("path does not exist")]
    NotFound,
    #[error("path is not a directory")]
    NotDirectory,
    #[error("cwd_not_allowed")]
    NotAllowed { path: String, allowed_roots: Vec<RootLabel> },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RootLabel {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

pub fn validate_cwd(cwd: &str, allowed_paths: &[(String, String, Option<String>)]) -> Result<PathBuf, PolicyError> {
    if cwd.contains('\0') {
        return Err(PolicyError::Invalid);
    }
    if !std::path::Path::new(cwd).is_absolute() {
        return Err(PolicyError::NotAbsolute);
    }
    for comp in Path::new(cwd).components() {
        if matches!(comp, Component::ParentDir) {
            return Err(PolicyError::ParentComponent);
        }
    }

    let resolved = std::fs::canonicalize(cwd).map_err(|_| PolicyError::NotFound)?;
    let meta = std::fs::metadata(&resolved).map_err(|_| PolicyError::NotFound)?;
    if !meta.is_dir() {
        return Err(PolicyError::NotDirectory);
    }

    let allowed: Vec<(PathBuf, RootLabel)> = allowed_paths
        .iter()
        .filter_map(|(id, path, label)| {
            std::fs::canonicalize(path)
                .ok()
                .map(|p| (p, RootLabel { id: id.clone(), label: label.clone() }))
        })
        .collect();

    for (root, label) in &allowed {
        if is_path_under(&resolved, root) {
            return Ok(resolved);
        }
        let _ = label;
    }

    Err(PolicyError::NotAllowed {
        path: resolved.to_string_lossy().into(),
        allowed_roots: allowed
            .into_iter()
            .map(|(_, l)| l)
            .collect(),
    })
}

fn is_path_under(path: &Path, root: &Path) -> bool {
    path.starts_with(root)
        && path.components().count() >= root.components().count()
        && !would_false_prefix_match(path, root)
}

fn would_false_prefix_match(path: &Path, root: &Path) -> bool {
    if path == root {
        return false;
    }
    if !path.starts_with(root) {
        return true;
    }
    if let Some(suffix) = path.strip_prefix(root).ok() {
        if let Some(first) = suffix.components().next() {
            return matches!(first, Component::Normal(_)) && false;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn rejects_relative() {
        let err = validate_cwd("relative", &[]).unwrap_err();
        assert_eq!(err, PolicyError::NotAbsolute);
    }

    #[test]
    fn rejects_parent_in_input() {
        let err = validate_cwd("/tmp/../etc", &[]).unwrap_err();
        assert!(matches!(err, PolicyError::ParentComponent | PolicyError::NotFound));
    }

    #[test]
    fn prefix_does_not_allow_sibling_prefix() {
        let tmp = TempDir::new().unwrap();
        let me = tmp.path().join("me");
        let mel = tmp.path().join("mel");
        fs::create_dir_all(&me).unwrap();
        fs::create_dir_all(&mel).unwrap();
        let me_canon = fs::canonicalize(&me).unwrap();
        let mel_canon = fs::canonicalize(&mel).unwrap();
        let roots = vec![(
            "r1".into(),
            me_canon.to_string_lossy().into(),
            Some("me".into()),
        )];
        let err = validate_cwd(mel_canon.to_str().unwrap(), &roots).unwrap_err();
        assert!(matches!(err, PolicyError::NotAllowed { .. }));
    }

    #[test]
    fn allows_under_root() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().join("proj");
        let sub = root.join("src");
        fs::create_dir_all(&sub).unwrap();
        let root_canon = fs::canonicalize(&root).unwrap();
        let sub_canon = fs::canonicalize(&sub).unwrap();
        let roots = vec![(
            "r1".into(),
            root_canon.to_string_lossy().into(),
            None,
        )];
        let ok = validate_cwd(sub_canon.to_str().unwrap(), &roots).unwrap();
        assert_eq!(ok, sub_canon);
    }
}

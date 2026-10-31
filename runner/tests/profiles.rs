use clithread_runner::db::Db;
use clithread_runner::profiles::{ProfileUpsert, Profiles};

#[test]
fn upsert_rejects_env_over_mcp() {
    let dir = tempfile::tempdir().unwrap();

    let db = Db::open_at(&dir.path().join("test.sqlite")).unwrap();
    let profiles = Profiles::new(db);
    let err = profiles
        .upsert_mcp(ProfileUpsert {
            id: "x".into(),
            name: "X".into(),
            adapter: "generic".into(),
            argv: vec!["echo".into()],
            env_refs: vec![],
            env: Some(serde_json::json!({ "SECRET": "nope" })),
        })
        .unwrap_err();
    assert!(err.to_string().contains("set-env"));
}

#[test]
fn list_strips_secrets() {
    let dir = tempfile::tempdir().unwrap();

    let db = Db::open_at(&dir.path().join("test.sqlite")).unwrap();
    db.seed_default_profiles().unwrap();
    let profiles = Profiles::new(db);
    profiles
        .set_env("codex", "OPENAI_API_KEY", "sk-test")
        .unwrap();
    let listed = profiles.list().unwrap();
    let raw = serde_json::to_string(&listed).unwrap();
    assert!(!raw.contains("sk-test"));
}

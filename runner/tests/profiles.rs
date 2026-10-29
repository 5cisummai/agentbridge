use agentbridge_runner::db::Db;
use agentbridge_runner::profiles::{ProfileUpsert, Profiles};

#[test]
fn upsert_rejects_env_over_mcp() {
    let dir = tempfile::tempdir().unwrap();
    std::env::set_var("AGENTBRIDGE_TEST_DIR", dir.path());

    let db = Db::open().unwrap();
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
    std::env::set_var("AGENTBRIDGE_TEST_DIR", dir.path());

    let db = Db::open().unwrap();
    db.seed_default_profiles().unwrap();
    let profiles = Profiles::new(db);
    profiles.set_env("codex", "OPENAI_API_KEY", "sk-test").unwrap();
    let listed = profiles.list().unwrap();
    let raw = serde_json::to_string(&listed).unwrap();
    assert!(!raw.contains("sk-test"));
}

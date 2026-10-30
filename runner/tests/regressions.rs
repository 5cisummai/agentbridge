use agentbridge_runner::{
    adapters::adapter_for_name, db::Db, events::EventSender, protocol::ThreadEventParams,
};
use serde_json::json;

#[test]
fn adapters_stream_partial_output_and_conservative_split_prompts() {
    for name in ["generic", "codex", "claude", "cursor"] {
        let mut adapter = adapter_for_name(name);
        assert!(!adapter.parse_chunk(b"partial output").is_empty(), "{name}");
        assert!(adapter
            .detect_approval(b"tool completed permission check\n")
            .is_none());
        if name != "generic" {
            assert!(adapter
                .detect_approval(b"Allow running this command? [y/")
                .is_none());
            assert!(adapter.detect_approval(b"n]").is_some(), "{name}");
            assert!(adapter.detect_approval(b" ").is_none());
        }
    }
}

#[test]
fn deleted_roots_stay_deleted_and_database_is_private() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("test.sqlite");
    let db = Db::open_at(&path).unwrap();
    db.seed_home_if_empty().unwrap();
    db.conn()
        .lock()
        .unwrap()
        .execute("DELETE FROM allowed_roots", [])
        .unwrap();
    db.seed_home_if_empty().unwrap();
    assert_eq!(
        db.conn()
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM allowed_roots", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}

#[test]
fn replay_is_shared_acknowledged_and_overflow_is_observable() {
    let events = EventSender::default();
    let reconnect = events.clone();
    for seq in 1..=2100 {
        events
            .send(ThreadEventParams {
                thread_id: "t".into(),
                seq,
                event_type: "assistant".into(),
                payload: json!({"text":"hello"}),
                raw: None,
            })
            .unwrap();
    }
    let mut count = 0;
    let mut gap = false;
    while let Some(event) = reconnect.front() {
        gap |= event.payload.get("delivery_gap").is_some();
        reconnect.ack(&event.thread_id, event.seq);
        count += 1;
    }
    assert_eq!(count, 2048);
    assert!(gap);
}

#[cfg(unix)]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn natural_exit_and_kill_release_slots_and_flush_output() {
    use agentbridge_runner::{
        approvals::ApprovalState,
        profiles::{Profile, Profiles},
        protocol::ThreadSpawnParams,
        threads::ThreadManager,
    };
    use std::sync::Arc;
    let dir = tempfile::tempdir().unwrap();
    let profiles = Arc::new(Profiles::new(
        Db::open_at(&dir.path().join("test.sqlite")).unwrap(),
    ));
    profiles
        .add_root(dir.path().to_str().unwrap(), None)
        .unwrap();
    let events = EventSender::default();
    let manager = ThreadManager::new(
        profiles.clone(),
        1,
        events.clone(),
        Arc::new(ApprovalState::default()),
    );
    for (id, command) in [
        ("natural", "printf tail"),
        (
            "killed",
            "trap '' HUP INT TERM; (sleep 0.3; touch orphan) & echo ready > ready; wait",
        ),
    ] {
        profiles
            .upsert(Profile {
                id: "shell".into(),
                name: "Shell".into(),
                adapter: "generic".into(),
                argv: vec!["/bin/sh".into(), "-c".into(), command.into()],
                env_refs: vec![],
            })
            .unwrap();
        manager
            .spawn(ThreadSpawnParams {
                thread_id: id.into(),
                profile: "shell".into(),
                cwd: dir.path().to_string_lossy().into(),
                name: None,
                initial_input: None,
            })
            .await
            .unwrap();
        if id == "killed" {
            tokio::time::timeout(std::time::Duration::from_secs(2), async {
                while !dir.path().join("ready").exists() {
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                }
            })
            .await
            .unwrap();
            manager.kill(id).await.unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            assert!(
                !dir.path().join("orphan").exists(),
                "descendant survived process-group kill"
            );
        }
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                if manager.list().await.unwrap().as_array().unwrap().is_empty() {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
    }
    let mut exits = 0;
    let mut tail = false;
    while let Some(ev) = events.front() {
        exits += usize::from(ev.event_type == "exit");
        tail |= ev.payload.to_string().contains("tail");
        events.ack(&ev.thread_id, ev.seq);
    }
    assert_eq!(exits, 2);
    assert!(tail);
}

#[test]
fn local_approval_timeout_is_fail_closed_and_idempotent() {
    let state = agentbridge_runner::approvals::ApprovalState::default();
    state.register("a".into(), "t".into(), "Allow? [y/n]".into());
    assert!(!state.expire_thread("t", std::time::Instant::now()));
    assert!(state.expire_thread(
        "t",
        std::time::Instant::now() + std::time::Duration::from_secs(901)
    ));
    assert!(state.take("a").is_none());
}

#[test]
fn raw_multiline_chunks_are_preserved_once() {
    let mut adapter = adapter_for_name("generic");
    let events = adapter.parse_chunk(b"first\nsecond\n");
    let raw: String = events.into_iter().filter_map(|e| e.raw).collect();
    assert_eq!(raw, "first\nsecond\n");
}

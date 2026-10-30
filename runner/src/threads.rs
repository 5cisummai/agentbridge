use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

use crate::adapters::adapter_for_name;
use crate::approvals::ApprovalState;
use crate::events::EventSender;
use crate::policy::PolicyError;
use crate::profiles::Profiles;
use crate::protocol::{
    ApprovalResolveParams, ThreadEventParams, ThreadSpawnParams, ERR_CWD_NOT_ALLOWED,
};
use crate::pty::{PtyKiller, PtySession};

#[derive(Clone)]
pub struct ThreadManager {
    inner: Arc<RwLock<ThreadManagerInner>>,
    profiles: Arc<Profiles>,
    max_threads: usize,
    event_tx: EventSender,
    approval_state: Arc<ApprovalState>,
}

struct ThreadManagerInner {
    threads: HashMap<String, RunningThread>,
}

struct RunningThread {
    thread_id: String,
    profile: String,
    cwd: String,
    name: Option<String>,
    status: String,
    stdin_tx: mpsc::UnboundedSender<(Vec<u8>, bool)>,
    killer: PtyKiller,
    approval_blocked: Arc<Mutex<bool>>,
}

impl ThreadManager {
    pub fn new(
        profiles: Arc<Profiles>,
        max_threads: usize,
        event_tx: EventSender,
        approval_state: Arc<ApprovalState>,
    ) -> Self {
        Self {
            inner: Arc::new(RwLock::new(ThreadManagerInner {
                threads: HashMap::new(),
            })),
            profiles,
            max_threads,
            event_tx,
            approval_state,
        }
    }

    pub async fn spawn(&self, params: ThreadSpawnParams) -> Result<Value> {
        let roots = self.profiles.list_roots()?;
        let cwd = match crate::policy::validate_cwd(&params.cwd, &roots) {
            Ok(p) => p,
            Err(PolicyError::NotAllowed {
                path,
                allowed_roots,
            }) => {
                return Err(anyhow!(
                    "cwd_not_allowed:{}",
                    serde_json::to_string(&json!({
                        "code": ERR_CWD_NOT_ALLOWED,
                        "path": path,
                        "allowed_roots": allowed_roots
                    }))?
                ));
            }
            Err(other) => return Err(anyhow!("{other}")),
        };

        let mut inner = self.inner.write().await;
        if inner.threads.len() >= self.max_threads {
            return Err(anyhow!("thread_limit"));
        }

        let profile = self
            .profiles
            .get(&params.profile)?
            .ok_or_else(|| anyhow!("profile_not_found"))?;

        let secrets = self.profiles.secrets_for_profile(&profile.id)?;
        let mut env: Vec<(String, String)> = secrets;
        for key in &profile.env_refs {
            if let Ok(val) = std::env::var(key) {
                env.push((key.clone(), val));
            }
        }

        let thread_id = params.thread_id.clone();
        let (stdin_tx, mut stdin_rx) = mpsc::unbounded_channel::<(Vec<u8>, bool)>();
        let event_tx = self.event_tx.clone();
        let approval_state = Arc::clone(&self.approval_state);
        let adapter_name = profile.adapter.clone();
        let approval_blocked = Arc::new(Mutex::new(false));
        let argv = profile.argv.clone();
        let cwd_path = cwd.clone();
        let tid = thread_id.clone();

        if inner.threads.contains_key(&thread_id) {
            return Err(anyhow!("thread_exists"));
        }
        let approval_blocked_store = Arc::clone(&approval_blocked);
        let manager_inner = Arc::clone(&self.inner);
        let runtime = tokio::runtime::Handle::current();
        let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
        std::thread::spawn(move || {
            let seq = Arc::new(Mutex::new(0u64));
            let mut adapter = adapter_for_name(&adapter_name);

            let emit = |seq: &Arc<Mutex<u64>>,
                        event_tx: &EventSender,
                        thread_id: &str,
                        event_type: &str,
                        payload: Value,
                        raw: Option<String>| {
                let mut s = seq.lock().unwrap();
                *s += 1;
                let _ = event_tx.send(ThreadEventParams {
                    thread_id: thread_id.to_string(),
                    seq: *s,
                    event_type: event_type.to_string(),
                    payload,
                    raw,
                });
            };

            let on_output = {
                let approval_state = Arc::clone(&approval_state);
                let approval_blocked = Arc::clone(&approval_blocked_store);
                let seq = Arc::clone(&seq);
                let event_tx = event_tx.clone();
                let tid_for_approval = tid.clone();
                move |chunk: Vec<u8>| {
                    if let Some(prompt) = adapter
                        .detect_approval(&chunk)
                        .filter(|_| !*approval_blocked.lock().unwrap())
                    {
                        let approval_id = Uuid::new_v4().to_string();
                        *approval_blocked.lock().unwrap() = true;
                        approval_state.register(
                            approval_id.clone(),
                            tid_for_approval.clone(),
                            prompt.prompt.clone(),
                        );
                        emit(
                            &seq,
                            &event_tx,
                            &tid_for_approval,
                            "approval_required",
                            json!({ "approval_id": approval_id, "prompt": prompt.prompt }),
                            None,
                        );
                    }
                    let events = if chunk.is_empty() {
                        adapter.finish()
                    } else {
                        adapter.parse_chunk(&chunk)
                    };
                    for ev in events {
                        emit(
                            &seq,
                            &event_tx,
                            &tid_for_approval,
                            &ev.event_type,
                            ev.payload,
                            ev.raw,
                        );
                    }
                }
            };

            let session = match PtySession::spawn(&argv, &cwd_path, &env, on_output) {
                Ok(s) => s,
                Err(e) => {
                    emit(
                        &seq,
                        &event_tx,
                        &tid,
                        "stderr",
                        json!({ "text": e.to_string() }),
                        None,
                    );
                    emit(&seq, &event_tx, &tid, "exit", json!({ "code": 1 }), None);
                    let _ = ready_tx.send(Err(e));
                    return;
                }
            };
            let _ = ready_tx.send(Ok(session.killer()));

            while !session.has_exited() {
                if approval_state.expire_thread(&tid, std::time::Instant::now()) {
                    *approval_blocked_store.lock().unwrap() = false;
                    let _ = session.write_stdin(adapter_for_name(&adapter_name).format_stdin("n"));
                    emit(
                        &seq,
                        &event_tx,
                        &tid,
                        "approval_timeout",
                        json!({"approved":false,"reason":"local_timeout"}),
                        None,
                    );
                }
                match stdin_rx.try_recv() {
                    Ok((bytes, approval))
                        if approval || !*approval_blocked_store.lock().unwrap() =>
                    {
                        let _ = session.write_stdin(bytes);
                    }
                    _ => std::thread::sleep(std::time::Duration::from_millis(10)),
                }
            }

            let code = session.wait_exit().unwrap_or(-1);
            {
                let mut inner = runtime.block_on(manager_inner.write());
                inner.threads.remove(&tid);
                approval_state.remove_thread(&tid);
            }
            emit(&seq, &event_tx, &tid, "exit", json!({ "code": code }), None);
        });

        let killer = ready_rx
            .await
            .map_err(|_| anyhow!("spawn worker stopped"))??;

        if let Some(input) = params.initial_input {
            let formatted = adapter_for_name(&profile.adapter).format_stdin(&input);
            let _ = stdin_tx.send((formatted, false));
        }

        inner.threads.insert(
            thread_id.clone(),
            RunningThread {
                thread_id: thread_id.clone(),
                profile: params.profile,
                cwd: params.cwd,
                name: params.name,
                status: "running".into(),
                stdin_tx,
                killer,
                approval_blocked,
            },
        );

        Ok(json!({ "thread_id": thread_id, "status": "running" }))
    }

    pub async fn send(&self, thread_id: &str, input: &str) -> Result<Value> {
        let inner = self.inner.read().await;
        let t = inner
            .threads
            .get(thread_id)
            .ok_or_else(|| anyhow!("thread_not_found"))?;
        if *t.approval_blocked.lock().unwrap() {
            return Err(anyhow!("approval_pending"));
        }
        let profile = self
            .profiles
            .get(&t.profile)?
            .ok_or_else(|| anyhow!("profile_not_found"))?;
        let bytes = adapter_for_name(&profile.adapter).format_stdin(input);
        t.stdin_tx
            .send((bytes, false))
            .map_err(|_| anyhow!("thread_closed"))?;
        Ok(json!({ "ok": true }))
    }

    pub async fn kill(&self, thread_id: &str) -> Result<Value> {
        let killer = {
            let inner = self.inner.read().await;
            inner
                .threads
                .get(thread_id)
                .ok_or_else(|| anyhow!("thread_not_found"))?
                .killer
                .clone()
        };
        killer.kill()?;
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                if !self.inner.read().await.threads.contains_key(thread_id) {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .map_err(|_| anyhow!("process termination timed out"))?;
        Ok(json!({ "ok": true }))
    }

    pub async fn list(&self) -> Result<Value> {
        let inner = self.inner.read().await;
        let rows: Vec<Value> = inner
            .threads
            .values()
            .map(|t| {
                json!({
                    "thread_id": t.thread_id,
                    "status": t.status,
                    "profile": t.profile,
                    "cwd": t.cwd,
                    "name": t.name,
                })
            })
            .collect();
        Ok(Value::Array(rows))
    }

    pub async fn resolve_approval(&self, params: ApprovalResolveParams) -> Result<Value> {
        if let Some(resolution) = self.approval_state.take(&params.approval_id) {
            let inner = self.inner.read().await;
            if let Some(t) = inner.threads.get(&resolution.thread_id) {
                *t.approval_blocked.lock().unwrap() = false;
                let profile = self
                    .profiles
                    .get(&t.profile)?
                    .ok_or_else(|| anyhow!("profile"))?;
                let adapter = adapter_for_name(&profile.adapter);
                let response = if params.approved { "y" } else { "n" };
                let _ = t.stdin_tx.send((adapter.format_stdin(response), true));
            }
        }
        Ok(json!({ "ok": true }))
    }
}

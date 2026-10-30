use std::sync::Arc;

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{info, warn};

use crate::config::Config;
use crate::enroll::DeviceCredential;
use crate::profiles::Profiles;
use crate::protocol::{
    DeviceHelloParams, JsonRpcRequest, JsonRpcResponse, RequestId, ThreadEventParams,
};
use crate::rpc::dispatch_rpc;
use crate::threads::ThreadManager;

pub async fn run_forever(
    cfg: Config,
    cred: DeviceCredential,
    profiles: Arc<Profiles>,
    threads: Arc<ThreadManager>,
    event_rx: crate::events::EventSender,
) -> Result<()> {
    let mut backoff = std::time::Duration::from_secs(1);
    loop {
        match run_session(
            &cfg,
            &cred,
            Arc::clone(&profiles),
            Arc::clone(&threads),
            &event_rx,
        )
        .await
        {
            Ok(()) => warn!("websocket closed, reconnecting"),
            Err(e) => warn!("session error: {e:#}, reconnecting"),
        }
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(std::time::Duration::from_secs(30));
    }
}

async fn run_session(
    cfg: &Config,
    cred: &DeviceCredential,
    profiles: Arc<Profiles>,
    threads: Arc<ThreadManager>,
    event_rx: &crate::events::EventSender,
) -> Result<()> {
    let ws_url = cfg.ws_url()?;
    let (ws, _) = connect_async(&ws_url).await.context("ws connect")?;
    let (mut write, mut read) = ws.split();

    let hello = JsonRpcRequest::request(
        RequestId::Str("hello-1".into()),
        "device.hello",
        serde_json::to_value(DeviceHelloParams {
            device_id: cred.device_id.clone(),
            credential: cred.device_secret.clone(),
            name: Some(cred.device_name.clone()),
            capabilities: Some(json!({
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
                "version": env!("CARGO_PKG_VERSION"),
            })),
        })?,
    );
    write
        .send(Message::Text(serde_json::to_string(&hello)?.into()))
        .await?;

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let mut authenticated = false;
    let mut sent_at = std::time::Instant::now();
    let mut in_flight: Option<ThreadEventParams> = None;

    let heartbeat = cfg.heartbeat_interval();
    let mut heartbeat_tick = tokio::time::interval(heartbeat);
    heartbeat_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            biased;
            Some(text) = out_rx.recv() => {
                if authenticated {
                    write.send(Message::Text(text.into())).await?;
                }
            }
            msg = read.next() => {
                let Some(msg) = msg else { break; };
                let msg = msg.context("ws message")?;
                if !msg.is_text() { continue; }
                let text = msg.to_text()?.to_string();
                let value: Value = serde_json::from_str(&text).context("parse json")?;

                if value.get("method").is_none() {
                if let Ok(resp) = serde_json::from_value::<JsonRpcResponse>(value.clone()) {
                    if resp.result.is_some() {
                        if matches!(&resp.id, Some(RequestId::Str(s)) if s == "hello-1") {
                            authenticated = true;
                            info!("connected as device {}", cred.device_id);

                        }
                    }
                    if matches!(&resp.id, Some(RequestId::Str(s)) if s == "event") {
                        if resp.error.is_some() { anyhow::bail!("event rejected: {:?}", resp.error); }
                        if resp.result.is_some() {
                            if let Some(ev) = in_flight.take() { event_rx.ack(&ev.thread_id, ev.seq); }
                        }
                    }
                    if matches!(&resp.id, Some(RequestId::Str(s)) if s == "hello-1") && resp.error.is_some() { anyhow::bail!("hello rejected"); }
                }
                } else {
                let req: JsonRpcRequest = serde_json::from_value(value).context("rpc request")?;
                if req.id.is_none() { continue; }
                let response = dispatch_rpc(&profiles, &threads, &req).await;
                write.send(Message::Text(serde_json::to_string(&response)?.into())).await?;
                }
            }
            _ = event_rx.notify.notified(), if authenticated && in_flight.is_none() => {}
            _ = heartbeat_tick.tick(), if authenticated => {
                if in_flight.is_some() && sent_at.elapsed() > std::time::Duration::from_secs(60) { anyhow::bail!("event acknowledgment timed out"); }
                let _ = queue_out(&out_tx, "device.heartbeat", json!({}));
            }
        }
        if authenticated && in_flight.is_none() {
            if let Some(ev) = event_rx.front() {
                if ev.event_type == "approval_required" {
                    let submit = JsonRpcRequest::notification(
                        "approval.submit",
                        json!({"thread_id":ev.thread_id,"approval_id":ev.payload["approval_id"],"prompt":ev.payload["prompt"]}),
                    );
                    write
                        .send(Message::Text(serde_json::to_string(&submit)?.into()))
                        .await?;
                }
                let request = JsonRpcRequest::request(
                    RequestId::Str("event".into()),
                    "thread.event",
                    serde_json::to_value(&ev)?,
                );
                write
                    .send(Message::Text(serde_json::to_string(&request)?.into()))
                    .await?;
                sent_at = std::time::Instant::now();
                in_flight = Some(ev);
            }
        }
    }

    Ok(())
}

fn queue_out(out_tx: &mpsc::UnboundedSender<String>, method: &str, params: Value) -> Result<()> {
    let msg = JsonRpcRequest::notification(method, params);
    out_tx.send(serde_json::to_string(&msg)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{approvals::ApprovalState, db::Db, events::EventSender};
    #[tokio::test]
    async fn dispatches_requests_and_replays_unacknowledged_events() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let cfg = Config {
            gateway_url: format!("http://{address}"),
            ..Config::default()
        };
        let cred = DeviceCredential {
            device_id: "d".into(),
            device_secret: "s".into(),
            device_name: "n".into(),
            gateway_url: cfg.gateway_url.clone(),
        };
        let dir = tempfile::tempdir().unwrap();
        let profiles = Arc::new(Profiles::new(
            Db::open_at(&dir.path().join("test.sqlite")).unwrap(),
        ));
        let events = EventSender::default();
        events
            .send(ThreadEventParams {
                thread_id: "t".into(),
                seq: 1,
                event_type: "assistant".into(),
                payload: json!({"text":"tail"}),
                raw: None,
            })
            .unwrap();
        let threads = Arc::new(ThreadManager::new(
            profiles.clone(),
            1,
            events.clone(),
            Arc::new(ApprovalState::default()),
        ));
        let client = tokio::spawn(run_forever(cfg, cred, profiles, threads, events.clone()));
        for attempt in 0..2 {
            let (stream, _) =
                tokio::time::timeout(std::time::Duration::from_secs(5), listener.accept())
                    .await
                    .unwrap()
                    .unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            ws.next().await.unwrap().unwrap();
            ws.send(Message::Text(
                json!({"jsonrpc":"2.0","id":"hello-1","result":{"ok":true}})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
            ws.send(Message::Text(
                json!({"jsonrpc":"2.0","id":"list","method":"thread.list","params":{}})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
            let mut got_event = false;
            let mut got_rpc = false;
            while !got_event || !got_rpc {
                let msg = tokio::time::timeout(std::time::Duration::from_secs(3), ws.next())
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap();
                if !msg.is_text() {
                    continue;
                }
                let value: Value = serde_json::from_str(msg.to_text().unwrap()).unwrap();
                if value["method"] == "thread.event" {
                    assert_eq!(value["params"]["seq"], 1);
                    got_event = true;
                }
                if value["id"] == "list" {
                    assert_eq!(value["result"], json!([]));
                    got_rpc = true;
                }
            }
            if attempt == 1 {
                ws.send(Message::Text(
                    json!({"jsonrpc":"2.0","id":"event","result":{"ok":true}})
                        .to_string()
                        .into(),
                ))
                .await
                .unwrap();
                tokio::time::timeout(std::time::Duration::from_secs(2), async {
                    while events.front().is_some() {
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .unwrap();
            }
            ws.close(None).await.unwrap();
        }
        client.abort();
    }
}

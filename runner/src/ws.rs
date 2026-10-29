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
    ApprovalSubmitParams, DeviceHelloParams, JsonRpcRequest, JsonRpcResponse, RequestId,
    ThreadEventParams,
};
use crate::rpc::dispatch_rpc;
use crate::threads::ThreadManager;

pub async fn run_forever(
    cfg: Config,
    cred: DeviceCredential,
    profiles: Arc<Profiles>,
    threads: Arc<ThreadManager>,
    mut event_rx: mpsc::UnboundedReceiver<ThreadEventParams>,
) -> Result<()> {
    let mut backoff = std::time::Duration::from_secs(1);
    loop {
        match run_session(
            &cfg,
            &cred,
            Arc::clone(&profiles),
            Arc::clone(&threads),
            &mut event_rx,
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
    event_rx: &mut mpsc::UnboundedReceiver<ThreadEventParams>,
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
    let mut pending_out: Vec<String> = Vec::new();

    let heartbeat = cfg.heartbeat_interval();
    let mut heartbeat_tick = tokio::time::interval(heartbeat);
    heartbeat_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            biased;
            Some(text) = out_rx.recv() => {
                if authenticated {
                    write.send(Message::Text(text.into())).await?;
                } else {
                    pending_out.push(text);
                }
            }
            Some(ev) = event_rx.recv() => {
                if ev.event_type == "approval_required" {
                    if let (Some(aid), Some(prompt)) = (
                        ev.payload.get("approval_id").and_then(|v| v.as_str()),
                        ev.payload.get("prompt").and_then(|v| v.as_str()),
                    ) {
                        let _ = queue_out(
                            &out_tx,
                            "approval.submit",
                            serde_json::to_value(ApprovalSubmitParams {
                                thread_id: ev.thread_id.clone(),
                                approval_id: aid.to_string(),
                                prompt: prompt.to_string(),
                            })?,
                        );
                    }
                }
                let _ = queue_out(&out_tx, "thread.event", serde_json::to_value(&ev)?);
            }
            msg = read.next() => {
                let Some(msg) = msg else { break; };
                let msg = msg.context("ws message")?;
                if !msg.is_text() { continue; }
                let text = msg.to_text()?.to_string();
                let value: Value = serde_json::from_str(&text).context("parse json")?;

                if let Ok(resp) = serde_json::from_value::<JsonRpcResponse>(value.clone()) {
                    if resp.result.is_some() {
                        if matches!(&resp.id, Some(RequestId::Str(s)) if s == "hello-1") {
                            authenticated = true;
                            info!("connected as device {}", cred.device_id);
                            for line in pending_out.drain(..) {
                                write.send(Message::Text(line.into())).await?;
                            }
                        }
                    }
                    continue;
                }

                let req: JsonRpcRequest = serde_json::from_value(value).context("rpc request")?;
                if req.id.is_none() { continue; }
                let response = dispatch_rpc(&profiles, &threads, &req).await;
                write.send(Message::Text(serde_json::to_string(&response)?.into())).await?;
            }
            _ = heartbeat_tick.tick(), if authenticated => {
                let _ = queue_out(&out_tx, "device.heartbeat", json!({}));
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

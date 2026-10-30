//! In-memory, ordered, acknowledged replay. Not durable across runner restarts.
use crate::protocol::ThreadEventParams;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};
use tokio::sync::Notify;
const MAX_EVENTS: usize = 2048;
const MAX_BYTES: usize = 4 * 1024 * 1024;
#[derive(Clone, Default)]
pub struct EventSender {
    inner: Arc<Mutex<(VecDeque<ThreadEventParams>, usize, u64)>>,
    pub notify: Arc<Notify>,
}
impl EventSender {
    pub fn send(&self, mut event: ThreadEventParams) -> Result<(), ()> {
        let mut q = self.inner.lock().unwrap();
        let mut size = serde_json::to_vec(&event).map_err(|_| ())?.len();
        if size > MAX_BYTES / 2 {
            event.raw = None;
            event.event_type = "output_gap".into();
            event.payload = serde_json::json!({"reason":"oversized_event", "original_bytes": size});
            size = serde_json::to_vec(&event).unwrap().len();
        }
        while q.0.len() >= MAX_EVENTS || q.1 + size + 256 > MAX_BYTES {
            let index =
                q.0.iter()
                    .position(|e| e.event_type != "approval_required" && e.event_type != "exit")
                    .unwrap_or(0);
            if let Some(old) = q.0.remove(index) {
                q.1 -= serde_json::to_vec(&old).unwrap().len();
                q.2 += 1 + old
                    .payload
                    .pointer("/delivery_gap/dropped_events")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
            } else {
                break;
            }
        }
        if q.2 > 0 {
            event.payload["delivery_gap"] =
                serde_json::json!({"dropped_events":q.2,"reason":"offline_buffer_limit"});
            q.2 = 0;
        }
        q.1 += serde_json::to_vec(&event).unwrap().len();
        q.0.push_back(event);
        drop(q);
        self.notify.notify_one();
        Ok(())
    }
    pub fn front(&self) -> Option<ThreadEventParams> {
        self.inner.lock().unwrap().0.front().cloned()
    }
    pub fn ack(&self, thread: &str, seq: u64) {
        let mut q = self.inner.lock().unwrap();
        if q.0
            .front()
            .is_some_and(|e| e.thread_id == thread && e.seq == seq)
        {
            let old = q.0.pop_front().unwrap();
            q.1 -= serde_json::to_vec(&old).unwrap().len();
        }
    }
}

use std::collections::HashMap;
use std::sync::Mutex;

pub struct ApprovalResolution {
    pub thread_id: String,
    pub prompt: String,
    created: std::time::Instant,
}

pub struct ApprovalState {
    pending: Mutex<HashMap<String, ApprovalResolution>>,
}

impl ApprovalState {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, approval_id: String, thread_id: String, prompt: String) {
        self.pending.lock().unwrap().insert(
            approval_id,
            ApprovalResolution {
                thread_id,
                prompt,
                created: std::time::Instant::now(),
            },
        );
    }

    pub fn remove_thread(&self, thread_id: &str) {
        self.pending
            .lock()
            .unwrap()
            .retain(|_, value| value.thread_id != thread_id);
    }

    pub fn expire_thread(&self, thread_id: &str, now: std::time::Instant) -> bool {
        let mut pending = self.pending.lock().unwrap();
        let expired = pending
            .iter()
            .find(|(_, value)| {
                value.thread_id == thread_id
                    && now.saturating_duration_since(value.created)
                        >= std::time::Duration::from_secs(900)
            })
            .map(|(id, _)| id.clone());
        expired.is_some_and(|id| pending.remove(&id).is_some())
    }

    pub fn take(&self, approval_id: &str) -> Option<ApprovalResolution> {
        self.pending.lock().unwrap().remove(approval_id)
    }
}

impl Default for ApprovalState {
    fn default() -> Self {
        Self::new()
    }
}

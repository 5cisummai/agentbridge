use std::collections::HashMap;
use std::sync::Mutex;

pub struct ApprovalResolution {
    pub thread_id: String,
    pub prompt: String,
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
            },
        );
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

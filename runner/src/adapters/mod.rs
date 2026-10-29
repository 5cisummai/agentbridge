pub mod codex;
pub mod claude;
pub mod cursor;
pub mod generic;

use serde_json::{json, Value};

use self::codex::CodexAdapter;
use self::claude::ClaudeAdapter;
use self::cursor::CursorAdapter;
use self::generic::GenericAdapter;

pub struct NormalizedEvent {
    pub event_type: String,
    pub payload: Value,
    pub raw: Option<String>,
}

pub struct ApprovalPrompt {
    pub prompt: String,
}

pub trait Adapter: Send {
    fn parse_chunk(&mut self, bytes: &[u8]) -> Vec<NormalizedEvent>;
    fn detect_approval(&mut self, bytes: &[u8]) -> Option<ApprovalPrompt>;
    fn format_stdin(&self, input: &str) -> Vec<u8>;
}

pub fn adapter_for_name(name: &str) -> Box<dyn Adapter> {
    match name {
        "codex" => Box::new(CodexAdapter::default()),
        "claude" => Box::new(ClaudeAdapter::default()),
        "cursor" => Box::new(CursorAdapter::default()),
        _ => Box::new(GenericAdapter::default()),
    }
}

pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&nc) = chars.peek() {
                    chars.next();
                    if nc.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

pub fn line_events(text: &str, raw: &str) -> Vec<NormalizedEvent> {
    let mut events = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        events.push(NormalizedEvent {
            event_type: "assistant".into(),
            payload: json!({ "text": trimmed }),
            raw: Some(raw.to_string()),
        });
    }
    if events.is_empty() && !raw.is_empty() {
        events.push(NormalizedEvent {
            event_type: "raw".into(),
            payload: json!({}),
            raw: Some(raw.to_string()),
        });
    }
    events
}

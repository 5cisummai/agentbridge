pub mod claude;
pub mod codex;
pub mod cursor;
pub mod generic;

use serde_json::{json, Value};

use self::claude::ClaudeAdapter;
use self::codex::CodexAdapter;
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
    fn finish(&mut self) -> Vec<NormalizedEvent> {
        Vec::new()
    }
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
            raw: None,
        });
    }
    if let Some(first) = events.first_mut() {
        first.raw = Some(raw.to_string());
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

/// Conservative terminal prompt fallback. Structured output never triggers approval.
#[derive(Default)]
pub struct PromptDetector {
    tail: String,
    emitted: bool,
}
impl PromptDetector {
    pub fn detect(&mut self, bytes: &[u8]) -> Option<ApprovalPrompt> {
        if self.emitted && self.tail.contains(['\n', '\r']) {
            self.tail.clear();
            self.emitted = false;
        }
        self.tail.push_str(&String::from_utf8_lossy(bytes));
        if self.tail.len() > 8192 {
            self.tail = self
                .tail
                .chars()
                .rev()
                .take(4096)
                .collect::<String>()
                .chars()
                .rev()
                .collect();
        }
        let clean = strip_ansi(&self.tail).to_lowercase();
        let line = clean
            .trim()
            .rsplit(['\n', '\r'])
            .next()
            .unwrap_or("")
            .trim();
        let matches = !line.starts_with('{')
            && (line.contains("[y/n]") || line.contains("(y/n)") || line.contains("[y/n/a]"))
            && (line.contains("allow")
                || line.contains("approve")
                || line.contains("permission")
                || line.contains("proceed")
                || line.contains("run command"));
        if matches && !self.emitted {
            self.emitted = true;
            return Some(ApprovalPrompt {
                prompt: line.to_string(),
            });
        }
        if !matches && bytes.contains(&b'\n') {
            self.emitted = false;
            self.tail.clear();
        }
        None
    }
}

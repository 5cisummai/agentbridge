use serde_json::json;

use super::{generic::GenericAdapter, line_events, Adapter, ApprovalPrompt, NormalizedEvent};

#[derive(Default)]
pub struct CursorAdapter {
    generic: GenericAdapter,
    line_buf: Vec<u8>,
}

impl Adapter for CursorAdapter {
    fn parse_chunk(&mut self, bytes: &[u8]) -> Vec<NormalizedEvent> {
        self.line_buf.extend_from_slice(bytes);
        let mut events = Vec::new();
        while let Some(pos) = self.line_buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.line_buf.drain(..=pos).collect();
            let raw = String::from_utf8_lossy(&line).trim().to_string();
            if raw.starts_with('{') {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                    let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if kind == "assistant" || kind == "text" {
                        let text = v
                            .get("content")
                            .or_else(|| v.get("text"))
                            .and_then(|c| c.as_str())
                            .unwrap_or("");
                        events.push(NormalizedEvent {
                            event_type: "assistant".into(),
                            payload: json!({ "text": text }),
                            raw: Some(raw.clone()),
                        });
                        continue;
                    }
                    if kind.contains("tool") {
                        events.push(NormalizedEvent {
                            event_type: "tool".into(),
                            payload: v,
                            raw: Some(raw.clone()),
                        });
                        continue;
                    }
                }
            }
            events.extend(line_events(&raw, &raw));
        }
        events
    }

    fn detect_approval(&mut self, bytes: &[u8]) -> Option<ApprovalPrompt> {
        let s = String::from_utf8_lossy(bytes);
        if s.contains("approve") || s.contains("Allow") || s.contains("run_terminal") {
            return Some(ApprovalPrompt {
                prompt: s.trim().to_string(),
            });
        }
        None
    }

    fn format_stdin(&self, input: &str) -> Vec<u8> {
        self.generic.format_stdin(input)
    }
}

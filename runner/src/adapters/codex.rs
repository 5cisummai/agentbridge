use serde_json::json;

use super::{generic::GenericAdapter, line_events, Adapter, ApprovalPrompt, NormalizedEvent};

#[derive(Default)]
pub struct CodexAdapter {
    generic: GenericAdapter,
    line_buf: Vec<u8>,
}

impl Adapter for CodexAdapter {
    fn parse_chunk(&mut self, bytes: &[u8]) -> Vec<NormalizedEvent> {
        self.line_buf.extend_from_slice(bytes);
        let mut events = Vec::new();
        while let Some(pos) = self.line_buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.line_buf.drain(..=pos).collect();
            let raw = String::from_utf8_lossy(&line).trim().to_string();
            if raw.starts_with('{') {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(t) = v.get("type").and_then(|t| t.as_str()) {
                        match t {
                            "assistant" | "message" => {
                                let text = v
                                    .pointer("/message/content")
                                    .or_else(|| v.get("content"))
                                    .and_then(|c| c.as_str())
                                    .unwrap_or("");
                                events.push(NormalizedEvent {
                                    event_type: "assistant".into(),
                                    payload: json!({ "text": text }),
                                    raw: Some(raw.clone()),
                                });
                                continue;
                            }
                            "tool" | "tool_call" => {
                                events.push(NormalizedEvent {
                                    event_type: "tool".into(),
                                    payload: v,
                                    raw: Some(raw.clone()),
                                });
                                continue;
                            }
                            _ => {}
                        }
                    }
                }
            }
            events.extend(line_events(&raw, &raw));
        }
        events
    }

    fn detect_approval(&mut self, bytes: &[u8]) -> Option<ApprovalPrompt> {
        let s = String::from_utf8_lossy(bytes);
        if s.contains("approval") || s.contains("Allow running") || s.contains("run command") {
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

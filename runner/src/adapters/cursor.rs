use serde_json::json;

use super::{generic::GenericAdapter, line_events, Adapter, ApprovalPrompt, NormalizedEvent};

#[derive(Default)]
pub struct CursorAdapter {
    generic: GenericAdapter,
    line_buf: Vec<u8>,
    prompt: super::PromptDetector,
}

impl Adapter for CursorAdapter {
    fn parse_chunk(&mut self, bytes: &[u8]) -> Vec<NormalizedEvent> {
        if self.line_buf.is_empty()
            && !bytes
                .iter()
                .copied()
                .find(|b| !b.is_ascii_whitespace())
                .is_some_and(|b| b == b'{')
        {
            return self.generic.parse_chunk(bytes);
        }
        self.line_buf.extend_from_slice(bytes);
        if self.line_buf.len() > 65536 {
            self.line_buf.clear();
            return vec![NormalizedEvent {
                event_type: "raw".into(),
                payload: json!({}),
                raw: Some(String::from_utf8_lossy(bytes).into_owned()),
            }];
        }
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
        // Preserve each transport chunk once for interactive/partial JSON output.
        for event in &mut events {
            event.raw = None;
        }
        events.push(NormalizedEvent {
            event_type: "raw".into(),
            payload: json!({}),
            raw: Some(String::from_utf8_lossy(bytes).into_owned()),
        });
        events
    }

    fn detect_approval(&mut self, bytes: &[u8]) -> Option<ApprovalPrompt> {
        self.prompt.detect(bytes)
    }

    fn finish(&mut self) -> Vec<NormalizedEvent> {
        let bytes = std::mem::take(&mut self.line_buf);
        let mut events = if bytes.is_empty() {
            Vec::new()
        } else {
            let mut bytes = bytes;
            bytes.push(b'\n');
            self.parse_chunk(&bytes)
        };
        events.retain(|event| event.event_type != "raw");
        for event in &mut events {
            event.raw = None;
        }
        events.extend(self.generic.finish());
        events
    }

    fn format_stdin(&self, input: &str) -> Vec<u8> {
        self.generic.format_stdin(input)
    }
}

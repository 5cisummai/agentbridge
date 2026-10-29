use super::{line_events, strip_ansi, Adapter, ApprovalPrompt, NormalizedEvent};

#[derive(Default)]
pub struct GenericAdapter {
    buf: Vec<u8>,
}

impl Adapter for GenericAdapter {
    fn parse_chunk(&mut self, bytes: &[u8]) -> Vec<NormalizedEvent> {
        self.buf.extend_from_slice(bytes);
        let mut events = Vec::new();
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = self.buf.drain(..=pos).collect();
            let raw = String::from_utf8_lossy(&line_bytes).trim_end().to_string();
            let text = strip_ansi(&raw);
            events.extend(line_events(&text, &raw));
        }
        events
    }

    fn detect_approval(&mut self, _bytes: &[u8]) -> Option<ApprovalPrompt> {
        None
    }

    fn format_stdin(&self, input: &str) -> Vec<u8> {
        let mut v = input.as_bytes().to_vec();
        if !v.ends_with(b"\n") {
            v.push(b'\n');
        }
        v
    }
}

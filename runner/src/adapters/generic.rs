use super::{line_events, strip_ansi, Adapter, ApprovalPrompt, NormalizedEvent};

#[derive(Default)]
pub struct GenericAdapter {
    buf: Vec<u8>,
}

impl Adapter for GenericAdapter {
    fn parse_chunk(&mut self, bytes: &[u8]) -> Vec<NormalizedEvent> {
        self.buf.extend_from_slice(bytes);
        let valid = match std::str::from_utf8(&self.buf) {
            Ok(_) => self.buf.len(),
            Err(e) if e.error_len().is_none() => e.valid_up_to(),
            Err(_) => self.buf.len(),
        };
        let bytes: Vec<u8> = self.buf.drain(..valid).collect();
        let raw = String::from_utf8_lossy(&bytes).to_string();
        line_events(&strip_ansi(&raw), &raw)
    }

    fn finish(&mut self) -> Vec<NormalizedEvent> {
        let raw = String::from_utf8_lossy(&std::mem::take(&mut self.buf)).to_string();
        line_events(&strip_ansi(&raw), &raw)
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

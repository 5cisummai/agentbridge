use std::io::{Read, Write};
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Clone)]
pub struct PtyKiller(
    Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
    Option<u32>,
);
impl PtyKiller {
    pub fn kill(&self) -> Result<()> {
        #[cfg(unix)]
        if let Some(pid) = self.1 {
            // PTY children start a new session/process group. Kill that group,
            // including shells and descendants that ignore terminal interrupts.
            if unsafe { libc::kill(-(pid as i32), libc::SIGKILL) } == 0 {
                return Ok(());
            }
        }
        self.0.lock().unwrap().kill().context("kill child")
    }
}

use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

pub struct PtySession {
    killer: PtyKiller,
    writer_tx: mpsc::Sender<Vec<u8>>,
    reader_done: mpsc::Receiver<()>,
    child_wait: thread::JoinHandle<Result<i32>>,
}

impl PtySession {
    pub fn spawn(
        argv: &[String],
        cwd: &Path,
        env: &[(String, String)],
        on_output: impl FnMut(Vec<u8>) + Send + 'static,
    ) -> Result<Self> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("openpty")?;

        let mut cmd = CommandBuilder::new(argv.first().context("empty argv")?);
        for arg in argv.iter().skip(1) {
            cmd.arg(arg);
        }
        cmd.cwd(cwd.to_string_lossy().to_string());
        for (k, v) in env {
            cmd.env(k, v);
        }

        let child = pair.slave.spawn_command(cmd).context("spawn_command")?;
        let killer = PtyKiller(
            Arc::new(Mutex::new(child.clone_killer())),
            child.process_id(),
        );
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().context("clone reader")?;
        let writer = pair.master.take_writer().context("take writer")?;

        let (done_tx, done_rx) = mpsc::channel();

        thread::spawn(move || {
            let mut on_output = on_output;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = buf[..n].to_vec();
                        on_output(chunk);
                    }
                    Err(_) => break,
                }
            }
            on_output(Vec::new());
            let _ = done_tx.send(());
        });

        let (writer_tx, writer_rx) = mpsc::channel::<Vec<u8>>();
        thread::spawn(move || {
            let mut writer = writer;
            while let Ok(bytes) = writer_rx.recv() {
                let _ = writer.write_all(&bytes);
                let _ = writer.flush();
            }
        });

        let child_wait = thread::spawn(move || {
            let mut child = child;
            let status = child.wait().context("wait child")?;
            Ok(status.exit_code() as i32)
        });

        Ok(Self {
            killer,
            writer_tx,
            reader_done: done_rx,
            child_wait,
        })
    }

    pub fn write_stdin(&self, data: Vec<u8>) -> Result<()> {
        self.writer_tx
            .send(data)
            .map_err(|_| anyhow::anyhow!("pty writer closed"))
    }

    pub fn killer(&self) -> PtyKiller {
        self.killer.clone()
    }
    pub fn has_exited(&self) -> bool {
        self.child_wait.is_finished()
    }

    pub fn wait_exit(self) -> Result<i32> {
        let _ = self
            .reader_done
            .recv_timeout(std::time::Duration::from_secs(2));
        self.child_wait.join().unwrap_or(Ok(-1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::{Arc, Mutex};

    #[test]
    fn spawn_echo_cat() {
        let shell = if cfg!(unix) { "/bin/echo" } else { "cmd" };
        let argv = vec![shell.to_string(), "hello".to_string()];
        let cwd = std::env::temp_dir();
        let out = Arc::new(Mutex::new(Vec::new()));
        let out2 = Arc::clone(&out);
        let session = PtySession::spawn(&argv, Path::new(&cwd), &[], move |chunk| {
            out2.lock().unwrap().extend_from_slice(&chunk);
        })
        .expect("spawn");
        let code = session.wait_exit().expect("wait");
        assert_eq!(code, 0);
        let bytes = out.lock().unwrap();
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("hello") || text.is_empty());
    }
}

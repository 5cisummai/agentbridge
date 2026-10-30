use std::sync::{Arc, Mutex};

use anyhow::Result;
use rusqlite::Connection;

use crate::paths;

pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn open() -> Result<Self> {
        paths::ensure_dirs()?;
        let path = paths::sqlite_file()?;
        Self::open_at(&path)
    }

    pub fn open_at(path: &std::path::Path) -> Result<Self> {
        crate::paths::private_file(path)?;
        let conn = Connection::open(path)?;
        let existing_roots: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='allowed_roots')", [], |row| row.get(0))?;
        conn.execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                adapter TEXT NOT NULL,
                argv_json TEXT NOT NULL,
                env_refs_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS profile_secrets (
                profile_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                PRIMARY KEY (profile_id, key),
                FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS allowed_roots (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                label TEXT
            );
            "#,
        )?;
        // Migration: an existing empty allowlist is an explicit deny-all state.
        if existing_roots {
            conn.execute(
                "INSERT OR IGNORE INTO settings VALUES ('roots_initialized', '1')",
                [],
            )?;
        }
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn conn(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    pub fn seed_home_if_empty(&self) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        if tx.execute(
            "INSERT OR IGNORE INTO settings VALUES ('roots_initialized', '1')",
            [],
        )? == 0
        {
            return Ok(());
        }
        let count: i64 = tx.query_row("SELECT COUNT(*) FROM allowed_roots", [], |r| r.get(0))?;
        if count == 0 {
            if let Some(home) = directories::UserDirs::new().map(|d| d.home_dir().to_path_buf()) {
                let id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO allowed_roots (id, path, label) VALUES (?1, ?2, ?3)",
                    rusqlite::params![id, home.to_string_lossy(), "Home"],
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn seed_default_profiles(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?;
        if count > 0 {
            return Ok(());
        }
        let now = chrono_now();
        let seeds: [(&str, &str, &str, &str); 3] = [
            ("codex", "Codex", "codex", r#"["codex"]"#),
            ("claude", "Claude Code", "claude", r#"["claude"]"#),
            ("cursor", "Cursor Agent", "cursor", r#"["cursor-agent"]"#),
        ];
        for (id, name, adapter, argv) in seeds {
            conn.execute(
                "INSERT OR IGNORE INTO profiles (id, name, adapter, argv_json, env_refs_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, '[]', ?5, ?5)",
                rusqlite::params![id, name, adapter, argv, now],
            )?;
        }
        Ok(())
    }
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    secs.to_string()
}

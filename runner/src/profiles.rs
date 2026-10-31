use anyhow::{anyhow, Context, Result};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::Db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub adapter: String,
    pub argv: Vec<String>,
    #[serde(default)]
    pub env_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileUpsert {
    pub id: String,
    pub name: String,
    pub adapter: String,
    pub argv: Vec<String>,
    #[serde(default)]
    pub env_refs: Vec<String>,
    #[serde(default)]
    pub env: Option<Value>,
}

pub struct Profiles {
    db: Db,
}

impl Profiles {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    fn with_conn<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        let conn_arc = self.db.conn();
        let conn = conn_arc.lock().unwrap();
        f(&conn)
    }

    pub fn list(&self) -> Result<Vec<Profile>> {
        self.with_conn(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, adapter, argv_json, env_refs_json FROM profiles ORDER BY name",
            )?;
            let rows = stmt.query_map([], |row| {
                let argv_json: String = row.get(3)?;
                let env_refs_json: String = row.get(4)?;
                Ok(Profile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    adapter: row.get(2)?,
                    argv: serde_json::from_str(&argv_json).unwrap_or_default(),
                    env_refs: serde_json::from_str(&env_refs_json).unwrap_or_default(),
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn get(&self, id: &str) -> Result<Option<Profile>> {
        self.with_conn(|conn| {
            conn.query_row(
                "SELECT id, name, adapter, argv_json, env_refs_json FROM profiles WHERE id = ?1",
                [id],
                |row| {
                    let argv_json: String = row.get(3)?;
                    let env_refs_json: String = row.get(4)?;
                    Ok(Profile {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        adapter: row.get(2)?,
                        argv: serde_json::from_str(&argv_json).unwrap_or_default(),
                        env_refs: serde_json::from_str(&env_refs_json).unwrap_or_default(),
                    })
                },
            )
            .optional()
            .map_err(Into::into)
        })
    }

    pub fn upsert_mcp(&self, profile: ProfileUpsert) -> Result<()> {
        if profile.env.is_some() {
            return Err(anyhow!(
                "env values are not allowed over MCP; use local set-env"
            ));
        }
        self.upsert(Profile {
            id: profile.id,
            name: profile.name,
            adapter: profile.adapter,
            argv: profile.argv,
            env_refs: profile.env_refs,
        })
    }

    pub fn upsert(&self, profile: Profile) -> Result<()> {
        let now = now_secs();
        let argv_json = serde_json::to_string(&profile.argv)?;
        let env_refs_json = serde_json::to_string(&profile.env_refs)?;
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO profiles (id, name, adapter, argv_json, env_refs_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   adapter = excluded.adapter,
                   argv_json = excluded.argv_json,
                   env_refs_json = excluded.env_refs_json,
                   updated_at = excluded.updated_at",
                rusqlite::params![
                    profile.id,
                    profile.name,
                    profile.adapter,
                    argv_json,
                    env_refs_json,
                    now
                ],
            )?;
            Ok(())
        })
    }

    pub fn delete(&self, profile_id: &str) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute("DELETE FROM profiles WHERE id = ?1", [profile_id])?;
            Ok(())
        })
    }

    pub fn set_env(&self, profile_id: &str, key: &str, value: &str) -> Result<()> {
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO profile_secrets (profile_id, key, value) VALUES (?1, ?2, ?3)
                 ON CONFLICT(profile_id, key) DO UPDATE SET value = excluded.value",
                rusqlite::params![profile_id, key, value],
            )?;
            Ok(())
        })
    }

    pub fn secrets_for_profile(&self, profile_id: &str) -> Result<Vec<(String, String)>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT key, value FROM profile_secrets WHERE profile_id = ?1")?;
            let rows = stmt.query_map([profile_id], |row| Ok((row.get(0)?, row.get(1)?)))?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn list_roots(&self) -> Result<Vec<(String, String, Option<String>)>> {
        self.with_conn(|conn| {
            let mut stmt =
                conn.prepare("SELECT id, path, label FROM allowed_roots ORDER BY path")?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
            rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
        })
    }

    pub fn add_root(&self, path: &str, label: Option<String>) -> Result<()> {
        let canon = std::fs::canonicalize(path).context("canonicalize root path")?;
        let id = uuid::Uuid::new_v4().to_string();
        self.with_conn(|conn| {
            conn.execute(
                "INSERT INTO allowed_roots (id, path, label) VALUES (?1, ?2, ?3)",
                rusqlite::params![id, canon.to_string_lossy(), label],
            )?;
            Ok(())
        })
    }

    pub fn remove_root(&self, path: &str) -> Result<()> {
        let canon = std::fs::canonicalize(path).context("canonicalize root path")?;
        self.with_conn(|conn| {
            conn.execute(
                "DELETE FROM allowed_roots WHERE path = ?1",
                [canon.to_string_lossy().to_string()],
            )?;
            Ok(())
        })
    }
}

fn now_secs() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

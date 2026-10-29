use std::sync::Arc;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

use agentbridge_runner::approvals::ApprovalState;
use agentbridge_runner::config::Config;
use agentbridge_runner::db::Db;
use agentbridge_runner::enroll::DeviceCredential;
use agentbridge_runner::enroll::oauth::run_enroll;
use agentbridge_runner::profiles::Profiles;
use agentbridge_runner::threads::ThreadManager;
use agentbridge_runner::ws;
use agentbridge_runner::otel;

#[derive(Parser)]
#[command(name = "agentbridge", about = "agentbridge device runner")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Enroll {
        #[arg(long, env = "AGENTBRIDGE_GATEWAY_URL")]
        gateway: Option<String>,
        #[arg(long)]
        name: Option<String>,
    },
    Run,
    Status,
    Roots {
        #[command(subcommand)]
        cmd: RootsCmd,
    },
    Profiles {
        #[command(subcommand)]
        cmd: ProfilesCmd,
    },
}

#[derive(Subcommand)]
enum RootsCmd {
    List,
    Add { path: String },
    Remove { path: String },
}

#[derive(Subcommand)]
enum ProfilesCmd {
    List,
    SetEnv {
        id: String,
        key_value: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("agentbridge_runner=info".parse()?))
        .init();
    otel::init_from_env();

    let cli = Cli::parse();
    match cli.command {
        Commands::Enroll { gateway, name } => run_enroll(gateway, name).await,
        Commands::Run => run_daemon().await,
        Commands::Status => cmd_status(),
        Commands::Roots { cmd } => cmd_roots(cmd),
        Commands::Profiles { cmd } => cmd_profiles(cmd),
    }
}

async fn run_daemon() -> Result<()> {
    let cred = DeviceCredential::load()?
        .context("not enrolled: run `agentbridge enroll` first")?;
    let cfg = Config::load()?;
    let db = Db::open()?;
    db.seed_home_if_empty()?;
    db.seed_default_profiles()?;
    let profiles = Arc::new(Profiles::new(db));
    let (event_tx, event_rx) = tokio::sync::mpsc::unbounded_channel();
    let approval_state = Arc::new(ApprovalState::new());
    let threads = Arc::new(ThreadManager::new(
        Arc::clone(&profiles),
        cfg.max_threads,
        event_tx,
        approval_state,
    ));
    ws::run_forever(cfg, cred, profiles, threads, event_rx).await
}

fn cmd_status() -> Result<()> {
    let cred = DeviceCredential::load()?;
    match cred {
        Some(c) => {
            println!("device_id: {}", c.device_id);
            println!("device_name: {}", c.device_name);
            println!("gateway: {}", c.gateway_url);
        }
        None => println!("not enrolled"),
    }
    Ok(())
}

fn cmd_roots(cmd: RootsCmd) -> Result<()> {
    let db = Db::open()?;
    db.seed_home_if_empty()?;
    let profiles = Profiles::new(db);
    match cmd {
        RootsCmd::List => {
            for (id, path, label) in profiles.list_roots()? {
                println!("{id}\t{path}\t{}", label.unwrap_or_default());
            }
        }
        RootsCmd::Add { path } => {
            profiles.add_root(&path, None)?;
            println!("added {path}");
        }
        RootsCmd::Remove { path } => {
            profiles.remove_root(&path)?;
            println!("removed {path}");
        }
    }
    Ok(())
}

fn cmd_profiles(cmd: ProfilesCmd) -> Result<()> {
    let db = Db::open()?;
    db.seed_default_profiles()?;
    let profiles = Profiles::new(db);
    match cmd {
        ProfilesCmd::List => {
            for p in profiles.list()? {
                println!("{} ({}) adapter={}", p.id, p.name, p.adapter);
            }
        }
        ProfilesCmd::SetEnv { id, key_value } => {
            let (key, value) = key_value
                .split_once('=')
                .context("expected KEY=value")?;
            profiles.set_env(&id, key, value)?;
            println!("set {key} on profile {id}");
        }
    }
    Ok(())
}

pub mod adapters;
pub mod approvals;
pub mod config;
pub mod db;
pub mod enroll;
pub mod otel;
pub mod paths;
pub mod policy;
pub mod profiles;
pub mod protocol;
pub mod pty;
pub mod rpc;
pub mod threads;
pub mod ws;

pub const RUNNER_OAUTH_CLIENT_ID: &str = "agentbridge-runner";
pub const DEVICE_CODE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";
pub const MAX_THREADS: usize = 8;

pub mod events;

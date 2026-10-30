# agentbridge runner

Rust device runner: outbound WebSocket to the gateway, PTY-backed CLI threads, SQLite profiles, cwd allowlist.

**Full setup (env vars, paths, MCP, production):** [`../docs/SETUP.md`](../docs/SETUP.md).

## Build

```bash
cd runner
cargo build --release
# binary: target/release/agentbridge
```

## Gateway URL

The runner must target the same gateway you use in the browser for OAuth.

| Source | Precedence |
|--------|------------|
| `AGENTBRIDGE_GATEWAY_URL` env | Overrides config for this process |
| `gateway_url` in config file | Default when env unset |

Local example:

```bash
export AGENTBRIDGE_GATEWAY_URL=http://localhost:8787
```

WebSocket hub URL is derived: `http` → `ws://…/ws`, `https` → `wss://…/ws`.

## Enroll

With the gateway running ([`server/`](../server/)) and a **verified** user account:

```bash
agentbridge enroll --name "$(hostname)"
```

1. CLI shows a device code.
2. Open `{gateway}/device` (e.g. `http://localhost:8787/device`), sign in, approve.
3. Credentials written to `device.json` (mode 0600).

OAuth client id (fixed): **`agentbridge-runner`**.

### Credential and config paths

| OS | Config | Device credential | SQLite |
|----|--------|-------------------|--------|
| macOS | `~/Library/Application Support/agentbridge/config.toml` | `.../device.json` | `~/Library/Application Support/agentbridge/runner.sqlite` |
| Linux | `$XDG_CONFIG_HOME/agentbridge/config.toml` | `.../device.json` | `$XDG_DATA_HOME/agentbridge/runner.sqlite` |

### `config.toml` keys

```toml
gateway_url = "http://localhost:8787"
heartbeat_interval_secs = 15
max_threads = 8   # default from build
```

## Run

```bash
agentbridge run
```

Sends `device.hello`, handles hub JSON-RPC (`thread.*`, `profile.*`, `workspace.*`, `approval.resolve`), emits `thread.event` and `approval.submit`.

## Local management

CLI secrets stay on the device (not on the gateway):

```bash
agentbridge status
agentbridge roots list|add /path|remove /path
agentbridge profiles list
agentbridge profiles set-env codex OPENAI_API_KEY=sk-...
```

## Environment variables

| Variable | Purpose |
|----------|--------|
| `AGENTBRIDGE_GATEWAY_URL` | Override `gateway_url` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OTLP HTTP traces |
| `AGENTBRIDGE_TEST_DIR` | Tests only — relocates config/data dirs |

## Tests

```bash
cargo test
```

## Protocol

Matches the gateway hub in [`server/src/hub/registry.ts`](../server/src/hub/registry.ts) and MCP forwards in [`server/src/mcp/register-tools.ts`](../server/src/mcp/register-tools.ts).

Device enroll (RFC 8628):

1. `POST /api/auth/device/code` (`client_id=agentbridge-runner`)
2. Poll `POST /api/auth/oauth2/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` and `resource={MCP_RESOURCE}`
3. `POST /v1/devices/enroll` with user Bearer token
